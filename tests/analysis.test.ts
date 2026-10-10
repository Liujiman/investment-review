import assert from "node:assert/strict";
import test from "node:test";
import { loadDemo } from "../src/lib/demo";
import { datasetSchema, type Dataset, type Trade } from "../src/lib/domain/schema";
import { calculateCash, formatCents, recognizePositions } from "../src/lib/domain/positions";
import { classifyEvidence, decisionCutoff } from "../src/lib/domain/visibility";
import { adoptPreview, HEADERS, parseTradesCsv } from "../src/lib/import/csv";

function trade(index: number, overrides: Partial<Trade> = {}): Trade {
  const base = loadDemo().trades[0];
  return { ...base, trade_id: `test-trade-${index}`, trade_date: `2025-03-${String(index + 1).padStart(2, "0")}`,
    trade_at: `2025-03-${String(index + 1).padStart(2, "0")}T10:00:00+08:00`, source_row: index + 2,
    evidence: { ...base.evidence, evidence_id: `test-evidence-${index}` }, ...overrides };
}
const visibility = (dataset: Dataset, id: string, decision = dataset.trades[0].trade_id) => classifyEvidence(dataset, decision).find((entry) => entry.id === id)!;
const eventVisibility = (dataset: Dataset, decision?: string) => visibility(dataset, dataset.events[0].evidence.evidence_id, decision);

test("sort by time, split zero-to-zero processes, and preserve original array", () => {
  const input = [trade(4, { side: "SELL" }), trade(3), trade(2, { side: "SELL" }), trade(1)];
  const originalIds = input.map((entry) => entry.trade_id);
  const result = recognizePositions(input);
  assert.deepEqual(result.issues, []); assert.equal(result.processes.length, 2);
  assert.deepEqual(result.processes.map((process) => [process.status, process.quantity, process.trades.map((entry) => entry.trade_id)]), [
    ["closed", 0n, ["test-trade-1", "test-trade-2"]], ["closed", 0n, ["test-trade-3", "test-trade-4"]],
  ]);
  assert.deepEqual(input.map((entry) => entry.trade_id), originalIds);
});

test("securities and modes remain independent; partial sale remains open; holdings never overflow Number", () => {
  const otherBuy = trade(1, { symbol: "600519.SH", data_mode: "real" });
  otherBuy.evidence.source_type = "user_provided"; otherBuy.evidence.quality.status = "unverified";
  const otherSell = structuredClone(otherBuy); otherSell.trade_id = "other-sell"; otherSell.side = "SELL"; otherSell.evidence.evidence_id = "other-sell-evidence";
  otherSell.trade_date = "2025-03-06"; otherSell.trade_at = "2025-03-06T10:00:00+08:00";
  const result = recognizePositions([trade(1), trade(2, { side: "SELL", quantity: 40 }), otherBuy, otherSell]);
  assert.deepEqual(result.processes.map((process) => [process.symbol, process.status, process.quantity]).sort(), [["600519.SH", "closed", 0n], ["DEMO001", "open", 60n]].sort());
  const huge = recognizePositions([trade(1, { quantity: Number.MAX_SAFE_INTEGER }), trade(2, { quantity: Number.MAX_SAFE_INTEGER })]);
  assert.equal(huge.processes[0].quantity, 2n * BigInt(Number.MAX_SAFE_INTEGER));
});

test("reject first sell and oversell without using later buys to repair; suppress broken symbol metrics", () => {
  const firstSell = recognizePositions([trade(1, { side: "SELL" }), trade(2)]);
  assert.equal(firstSell.issues[0].code, "SELL_BEFORE_BUY"); assert.equal(firstSell.processes.length, 0);
  const oversell = recognizePositions([trade(1), trade(2, { side: "SELL", quantity: 101 }), trade(3)]);
  assert.equal(oversell.issues[0].code, "OVERSELL"); assert.equal(oversell.issues[0].row, 4); assert.equal(oversell.processes.length, 0);
  const brokenLater = recognizePositions([trade(1), trade(2, { side: "SELL" }), trade(3, { side: "SELL" })]);
  assert.equal(brokenLater.processes.length, 0);
});

test("date-only execution needs confirmed order; precise order conflicts and same instant require confirmation", () => {
  const buy = trade(1, { trade_at: null, time_precision: "date", same_day_order: 1 });
  const sell = trade(2, { trade_date: buy.trade_date, trade_at: null, time_precision: "date", side: "SELL", same_day_order: 2 });
  assert.equal(recognizePositions([sell, buy]).processes[0].status, "closed");
  assert.equal(recognizePositions([{ ...buy, order_confirmed: false }, sell]).issues[0].code, "PENDING_ORDER");
  assert.equal(recognizePositions([{ ...buy, same_day_order: null }, sell]).issues[0].code, "PENDING_ORDER");
  const preciseBuy = trade(1, { same_day_order: 2 });
  const preciseSell = trade(2, { trade_date: preciseBuy.trade_date, trade_at: "2025-03-02T11:00:00+08:00", side: "SELL", same_day_order: 1 });
  assert.equal(recognizePositions([preciseBuy, preciseSell]).issues[0].code, "ORDER_CONFLICT");
  preciseSell.trade_at = preciseBuy.trade_at; preciseBuy.same_day_order = null; preciseSell.same_day_order = null;
  assert.equal(recognizePositions([preciseBuy, preciseSell]).issues[0].code, "PENDING_ORDER");
});

test("adoption rejects negative holdings, retains input preview, and permits unfinished buys", () => {
  const header = HEADERS.join(","), buy = "DEMO001,构造公司,2025-03-03,10:00:00,BUY,100,10,5,1";
  let sequence = 0;
  const parse = (rows: string) => parseTradesCsv(new TextEncoder().encode(`${header}\n${rows}`), "test.csv", "constructed", { id: () => `id-${++sequence}` });
  const firstSell = parse(buy.replace("BUY", "SELL"));
  assert.throws(() => adoptPreview(firstSell, [], [], []), /SELL_BEFORE_BUY/); assert.equal(firstSell.trades.length, 1);
  assert.throws(() => adoptPreview(parse(`${buy}\n${buy.replace("2025-03-03", "2025-03-04").replace("BUY,100", "SELL,101")}`), [], [], []), /OVERSELL/);
  const open = adoptPreview(parse(buy), [], [], []); assert.equal(recognizePositions(open.trades).processes[0].status, "open");
});

test("fixed case cash uses integer cents and exact actual fees, with stable dependencies", () => {
  const process = recognizePositions(loadDemo().trades).processes[0];
  const cash = calculateCash(process);
  assert.equal(cash.buy_cents, 100000n); assert.equal(cash.sell_cents, 90000n);
  assert.equal(cash.gross_pnl_cents, -10000n); assert.equal(cash.total_fee_cents, 1000n); assert.equal(cash.net_pnl_cents, -11000n);
  assert.equal(formatCents(cash.net_pnl_cents!), "-110.00"); assert.equal(cash.status, "provisional");
  assert.deepEqual(cash.input_trade_ids, ["demo001-buy", "demo001-sell"]);
  assert.deepEqual(cash.dependency_evidence_ids, ["evidence-demo001-buy", "evidence-demo001-sell"]);
});

test("missing fees hide only net metrics; explicit zero is known; no unrealized liquidation for open positions", () => {
  const demo = loadDemo(); demo.trades[0].fee = null;
  const cash = calculateCash(recognizePositions(demo.trades).processes[0]);
  assert.equal(cash.net_pnl_cents, null); assert.equal(cash.total_fee_cents, null); assert.equal(cash.known_fee_cents, 500n);
  assert.equal(cash.missing_fee_count, 1); assert.equal(cash.gross_pnl_cents, -10000n);
  demo.trades.forEach((entry) => { entry.fee = "0"; });
  assert.equal(calculateCash(recognizePositions(demo.trades).processes[0]).net_pnl_cents, -10000n);
  const open = recognizePositions([demo.trades[0]]).processes[0];
  assert.equal(calculateCash(open).gross_pnl_cents, null); assert.equal(calculateCash({ ...open, status: "closed" }).net_pnl_cents, null);
});

test("known corporate actions block simplified P&L; unknown completeness remains provisional", () => {
  const process = recognizePositions(loadDemo().trades).processes[0];
  const unsupported = calculateCash(process, "present");
  assert.equal(unsupported.gross_pnl_cents, null); assert.equal(unsupported.net_pnl_cents, null); assert.equal(unsupported.status, "blocked");
  assert.equal(unsupported.buy_cents, 100000n); assert.equal(calculateCash(process, "none_confirmed").status, "provisional");
  assert.throws(() => calculateCash({ ...process, trades: [process.trades[1], { ...process.trades[0], trade_date: "2025-03-11", trade_at: "2025-03-11T10:00:00+08:00" }] }), /无效持仓/);
});

test("sub-cent prices retain precision until aggregation, half-up negatives and huge amounts remain exact", () => {
  const trades = [trade(1, { quantity: 3, price: "0.335", fee: "0" }), trade(2, { side: "SELL", quantity: 3, price: "0.33", fee: "0" })];
  const cash = calculateCash(recognizePositions(trades).processes[0]);
  assert.equal(cash.buy_cents, 101n); assert.equal(cash.sell_cents, 99n); assert.equal(cash.gross_pnl_cents, -2n);
  const aggregation = [trade(1, { quantity: 1, price: "0.004", fee: "0" }), trade(2, { quantity: 1, price: "0.004", fee: "0" }), trade(3, { side: "SELL", quantity: 2, price: "0.009", fee: "0" })];
  assert.equal(calculateCash(recognizePositions(aggregation).processes[0]).buy_cents, 1n);
  const huge = [trade(1, { quantity: Number.MAX_SAFE_INTEGER, price: "999999999999999.123456", fee: "0" }), trade(2, { quantity: Number.MAX_SAFE_INTEGER, price: "999999999999999.123456", fee: "0", side: "SELL" })];
  assert.equal(calculateCash(recognizePositions(huge).processes[0]).net_pnl_cents, 0n);
  assert.equal(formatCents(1n), "0.01"); assert.equal(formatCents(0n), "0.00");
});

test("fixed first-buy visibility is 3 prior, 5 post, 1 unknown; decision switch recomputes", () => {
  const demo = loadDemo(), entries = classifyEvidence(demo, demo.trades[0].trade_id);
  assert.deepEqual(["prior", "post", "unknown"].map((value) => entries.filter((entry) => entry.time_class === value).length), [3, 5, 1]);
  assert.equal(visibility(demo, demo.events[2].evidence.evidence_id).time_class, "unknown");
  assert.equal(visibility(demo, demo.market_bars[1].evidence.evidence_id).time_class, "post");
  assert.equal(visibility(demo, demo.reasons[1].evidence.evidence_id).time_class, "post");
  assert.equal(visibility(demo, demo.trades[0].evidence.evidence_id).time_class, "post");
  assert.equal(visibility(demo, demo.events[2].evidence.evidence_id, demo.trades[1].trade_id).time_class, "prior");
  assert.equal(visibility(demo, demo.trades[0].evidence.evidence_id, demo.trades[1].trade_id).time_class, "prior");
  assert.throws(() => classifyEvidence(demo, "missing-trade"));
});

test("strict equality is post; Shanghai offset comparisons and date intervals never invent an hour", () => {
  const demo = loadDemo(), event = demo.events[0];
  event.published_date = "2025-03-03"; event.published_at = "2025-03-03T02:00:00Z";
  event.evidence.first_available = { date: event.published_date, at: event.published_at, precision: "datetime", basis: "测试相同时点" };
  assert.equal(eventVisibility(datasetSchema.parse(demo)).time_class, "post");
  event.published_at = "2025-03-03T01:59:59.999Z"; event.evidence.first_available.at = event.published_at;
  assert.equal(eventVisibility(datasetSchema.parse(demo)).time_class, "prior");
  event.published_at = null; event.time_precision = "date"; event.evidence.first_available.precision = "date"; event.evidence.first_available.at = null;
  assert.equal(eventVisibility(datasetSchema.parse(demo)).time_class, "unknown");
  event.published_date = "2025-03-02"; event.evidence.first_available.date = event.published_date;
  assert.equal(eventVisibility(datasetSchema.parse(demo)).time_class, "prior");
  event.published_date = "2025-03-04"; event.evidence.first_available.date = event.published_date;
  assert.equal(eventVisibility(datasetSchema.parse(demo)).time_class, "post");
});

test("unknown original publication remains unknown regardless of early fetch or management dates", () => {
  const demo = loadDemo(), event = demo.events[0];
  event.published_date = null; event.published_at = null; event.time_precision = "unknown";
  event.evidence.first_available = { date: null, at: null, precision: "unknown", basis: "无公开证明" };
  event.evidence.fetched_at = "2025-03-01T10:00:00+08:00";
  event.occurred_date = "2025-02-01"; event.updated_at = "2025-02-02T10:00:00+08:00";
  assert.equal(eventVisibility(datasetSchema.parse(demo)).time_class, "unknown");
});

test("edited old reports and reasons with no historical version or conflicts never become prior", () => {
  const demo = loadDemo(); demo.events[0].historical_version_confirmed = false; demo.events[0].excerpt = "测试当前修订内容";
  assert.equal(eventVisibility(demo).time_class, "unknown");
  demo.events[0].historical_version_confirmed = true; demo.events[0].has_time_conflict = true;
  assert.equal(eventVisibility(demo).time_class, "unknown");
  demo.reasons[0].historical_version_confirmed = false;
  assert.equal(visibility(demo, demo.reasons[0].evidence.evidence_id).time_class, "unknown");
  demo.reasons[0].historical_version_confirmed = true; demo.reasons[0].has_time_conflict = true;
  assert.equal(visibility(demo, demo.reasons[0].evidence.evidence_id).time_class, "unknown");
});

test("date-only decision uses conservative midnight, confirmed execution order is not a known hour", () => {
  const demo = loadDemo(); demo.trades[0].time_precision = "date"; demo.trades[0].trade_at = null;
  assert.equal(decisionCutoff(demo.trades[0]).at, "2025-03-03T00:00:00+08:00");
  assert.equal(visibility(demo, demo.events[2].evidence.evidence_id).time_class, "post");
  const historical = trade(1, { trade_date: "2025-03-03", trade_at: null, time_precision: "date", same_day_order: 1 });
  historical.evidence.first_available = { date: "2025-03-03", at: null, precision: "date", basis: "仅日期成交" };
  demo.trades.push(historical); demo.trades[0].trade_at = "2025-03-03T10:00:00+08:00"; demo.trades[0].time_precision = "datetime";
  assert.equal(visibility(demo, historical.evidence.evidence_id).time_class, "unknown");
});

test("same-day full daily bars cannot become prior even with premature availability or evening decisions", () => {
  const demo = loadDemo(), bar = demo.market_bars[1];
  bar.evidence.first_available.at = "2025-03-03T09:00:00+08:00";
  assert.equal(visibility(demo, bar.evidence.evidence_id).time_class, "post");
  demo.trades[0].trade_at = "2025-03-03T20:00:00+08:00";
  assert.equal(visibility(demo, bar.evidence.evidence_id).time_class, "post");
  bar.evidence.first_available = { date: null, at: null, precision: "unknown", basis: "无版本及历史可得证明" };
  bar.evidence.fetched_at = "2025-03-02T18:00:00+08:00";
  assert.equal(visibility(demo, bar.evidence.evidence_id).time_class, "unknown");
});

test("recall and later-trade reasons cannot bypass prior filtering, other securities are excluded", () => {
  const demo = loadDemo(), recall = demo.reasons[1];
  recall.formed_date = "2025-03-01"; recall.formed_at = "2025-03-01T09:30:00+08:00";
  recall.evidence.first_available = { date: recall.formed_date, at: recall.formed_at, precision: "datetime", basis: "回忆不能当作当时原文" };
  assert.equal(visibility(demo, recall.evidence.evidence_id).time_class, "unknown");
  recall.record_type = "contemporaneous"; recall.trade_id = demo.trades[1].trade_id;
  assert.equal(visibility(demo, recall.evidence.evidence_id).time_class, "unknown");
  const other = structuredClone(demo.events[0]); other.symbol = "600519.SH"; other.event_id = "other-event"; other.evidence.evidence_id = "other-evidence";
  demo.events.push(other);
  assert.equal(classifyEvidence(demo, demo.trades[0].trade_id).some((entry) => entry.id === "other-evidence"), false);
});
