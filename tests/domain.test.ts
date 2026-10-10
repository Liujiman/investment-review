import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { loadDemo } from "../src/lib/demo";
import { datasetSchema, eventSchema, marketBarSchema, reasonSchema, tradeSchema } from "../src/lib/domain/schema";
import { adoptPreview, HEADERS, parseTradesCsv } from "../src/lib/import/csv";
import { decodeDataset, saveDataset, STORAGE_KEY } from "../src/lib/storage/dataset-store";
import { appendReason, type ReasonInput } from "../src/lib/domain/reasons";
import { unifiedEvidence } from "../src/lib/domain/timeline";
import { appendEvent, decodeEvidenceText, type EventInput } from "../src/lib/domain/events";
import { classifyEvidence } from "../src/lib/domain/visibility";
import { calculateCash, recognizePositions } from "../src/lib/domain/positions";

const now = "2026-10-10T00:00:00+08:00";
const bytes = (text: string) => new TextEncoder().encode(text);
function parse(text: string, mode: "real" | "constructed" = "constructed", filename = "test.csv") {
  let sequence = 0;
  return parseTradesCsv(bytes(text), filename, mode, { now, id: () => `test-id-${++sequence}` });
}
const sample = (name: string) => readFileSync(`public/samples/${name}`, "utf8");
const header = HEADERS.join(",");
const row = "DEMO001,构造公司,2025-03-03,10:00:00,BUY,100,10,5,1";

test("fixed full fixture exactly matches requested two-trade case and all records are synthetic", () => {
  const demo = loadDemo();
  assert.equal(demo.trades.length, 2); assert.equal(demo.events.length, 3); assert.equal(demo.market_bars.length, 2); assert.equal(demo.reasons.length, 2);
  assert.deepEqual(demo.trades.map((trade) => [trade.trade_at, trade.side, trade.quantity, trade.price, trade.fee]), [
    ["2025-03-03T10:00:00+08:00", "BUY", 100, "10", "5"], ["2025-03-10T14:00:00+08:00", "SELL", 100, "9", "5"],
  ]);
  for (const record of [...demo.trades, ...demo.reasons, ...demo.events, ...demo.market_bars]) {
    assert.equal(record.evidence.source_type, "synthetic"); assert.equal(record.evidence.quality.status, "synthetic");
    assert.ok(record.evidence.evidence_id); assert.ok(Object.keys(record.evidence.units).length); assert.ok(Object.keys(record.evidence.source_fields).length);
  }
  assert.deepEqual(loadDemo(), demo);
  demo.trades[0].fee = null;
  assert.equal(loadDemo().trades[0].fee, "5");
});

test("date-only availability stays date-only and recall remains post-trade, separate from original", () => {
  const demo = loadDemo(); const event = demo.events[2];
  assert.equal(event.published_date, "2025-03-03"); assert.equal(event.published_at, null);
  assert.equal(event.evidence.first_available.at, null); assert.equal(event.evidence.first_available.precision, "date");
  assert.ok(Date.parse(demo.reasons[0].formed_at!) < Date.parse(demo.trades[0].trade_at!));
  assert.ok(Date.parse(demo.reasons[1].formed_at!) > Date.parse(demo.trades[1].trade_at!));
  assert.ok(Date.parse(demo.market_bars[1].evidence.first_available.at!) > Date.parse(demo.trades[0].trade_at!));
  assert.equal(reasonSchema.safeParse({ ...demo.reasons[1], formed_at: demo.reasons[0].formed_at }).success, false);
});

test("all four schemas reject unknown fields, fabricated time precision and unsafe source URLs", () => {
  const demo = loadDemo();
  for (const [schema, record] of [[tradeSchema, demo.trades[0]], [reasonSchema, demo.reasons[0]], [eventSchema, demo.events[0]], [marketBarSchema, demo.market_bars[0]]] as const) {
    assert.equal(schema.safeParse({ ...record, unknown_field: "reject" }).success, false);
    assert.equal(schema.safeParse({ ...record, evidence: { ...record.evidence, secret: "reject" } }).success, false);
  }
  assert.equal(eventSchema.safeParse({ ...demo.events[2], published_at: "2025-03-03T00:00:00+08:00" }).success, false);
  assert.equal(eventSchema.safeParse({ ...demo.events[0], source_url: "javascript:alert(1)" }).success, false);
  assert.equal(tradeSchema.safeParse({ ...demo.trades[0], trade_at: "nonsense" }).success, false);
});

test("invalid decimals, unknown keys, duplicate IDs and cross-mode evidence reject without throwing", () => {
  const demo = loadDemo();
  for (const price of ["NaN", "Infinity", "1e3", "0", "1.1234567", "10元", "-1"]) assert.equal(tradeSchema.safeParse({ ...demo.trades[0], price }).success, false);
  assert.equal(marketBarSchema.safeParse({ ...demo.market_bars[0], high: "bad" }).success, false);
  assert.equal(marketBarSchema.safeParse({ ...demo.market_bars[0], high: "1" }).success, false);
  assert.equal(datasetSchema.safeParse({ ...demo, trades: [demo.trades[0], demo.trades[0]] }).success, false);
  assert.equal(datasetSchema.safeParse({ ...demo, data_mode: "real" }).success, false);
});

test("downloadable CSV agrees with full fixture and import retains source and unknown first-availability", () => {
  const preview = parse(sample("demo-trades.csv")); assert.deepEqual(preview.errors, []);
  const saved = adoptPreview(preview, [], [], []); const demo = loadDemo();
  assert.deepEqual(saved.trades.map((trade) => [trade.trade_at, trade.quantity, trade.price, trade.fee]), demo.trades.map((trade) => [trade.trade_at, trade.quantity, trade.price, trade.fee]));
  assert.equal(saved.reasons.length, 0); assert.equal(saved.events.length, 0); assert.equal(saved.market_bars.length, 0);
  assert.equal(saved.trades[0].evidence.first_available.at, null); assert.equal(saved.trades[0].evidence.first_available.precision, "unknown");
  assert.equal(saved.trades[0].evidence.fetched_at, null); assert.equal(saved.trades[0].source_row, 2);
});

test("negative quantity blocks whole import; missing fee remains null, explicit zero remains zero", () => {
  const bad = parse(sample("negative-quantity.csv")); assert.ok(bad.errors.some((error) => error.row === 2 && error.field === "quantity"));
  assert.throws(() => adoptPreview(bad, [], [], []));
  const missing = parse(sample("missing-fee.csv")); assert.deepEqual(missing.errors, []);
  assert.equal(adoptPreview(missing, [], [], []).trades[0].fee, null);
  assert.equal(missing.warnings[0].code, "FEE_UNKNOWN");
  assert.equal(parse(`${header}\n${row.replace(",10,5,", ",10,0,")}`).trades[0].fee, "0");
});

test("real and constructed modes are separated, real records are unverified user inputs", () => {
  assert.ok(parse(sample("demo-trades.csv"), "real").errors.some((error) => error.code === "MODE_MISMATCH"));
  const realCsv = `${header}\n${row.replace("DEMO001", "600519.SH")}`;
  assert.ok(parse(realCsv).errors.some((error) => error.code === "MODE_MISMATCH"));
  const real = parse(realCsv, "real"); assert.deepEqual(real.errors, []);
  assert.equal(real.trades[0].evidence.source_type, "user_provided"); assert.equal(real.trades[0].evidence.quality.status, "unverified");
});

test("CSV library handles BOM, commas, escaped quotes and multiline text with physical row numbers", () => {
  const csv = `\uFEFF${header}\n\n${row.replace("构造公司", '"构造,公司"')}\n${row.replace("构造公司", '"第一行\n第二行"').replace("2025-03-03", "2025-03-04")}\n${row.replace("构造公司", '"带""引号"""').replace("2025-03-03", "2025-03-05")}\n`;
  const preview = parse(csv); assert.deepEqual(preview.errors, []);
  assert.equal(preview.ignored_blank_rows, 1); assert.deepEqual(preview.trades.map((trade) => trade.source_row), [3, 4, 6]);
  assert.deepEqual(preview.trades.map((trade) => trade.name), ["构造,公司", "第一行\n第二行", '带"引号"']);
});

test("header, format, encoding, file size and record count are enforced", () => {
  for (const csv of [`symbol,name\nDEMO001,x`, `${header},unexpected\n${row},x`, `${header},symbol\n${row},DEMO001`]) assert.ok(parse(csv).errors.some((error) => error.code === "CSV_HEADER"));
  assert.ok(parse(`${header}\n${row.replace("2025-03-03", "2025-02-30")}`).errors.length);
  assert.ok(parse(`${header}\n${row.replace("10:00:00", "10:00")}`).errors.some((error) => error.field === "trade_time"));
  assert.ok(parse(`${header}\nDEMO001,"unterminated`).errors.some((error) => error.code === "CSV_SYNTAX"));
  assert.ok(parseTradesCsv(new Uint8Array([255]), "test.csv", "real").errors.some((error) => error.code === "ENCODING"));
  assert.ok(parseTradesCsv(new Uint8Array(2 * 1024 * 1024 + 1), "test.csv", "real").errors.some((error) => error.code === "FILE_SIZE"));
  assert.ok(parse(`${header}\n${Array.from({ length: 5001 }, () => row).join("\n")}`).errors.some((error) => error.code === "ROW_LIMIT"));
});

test("same-day unknown order and duplicate decisions gate adoption, exclusions are recorded", () => {
  const sameDay = parse(`${header}\n${row.replace("10:00:00", "").replace(/,1$/, ",")}\n${row.replace("10:00:00", "").replace(/,1$/, ",").replace("BUY", "SELL")}`);
  assert.equal(sameDay.orders.length, 1); assert.throws(() => adoptPreview(sameDay, [], [], []));
  const adopted = adoptPreview(sameDay, [], [], [sameDay.orders[0].key]);
  assert.equal(adopted.trades[0].trade_at, null); assert.equal(adopted.trades[0].order_confirmed, true);
  const duplicate = parse(`${header}\n${row.replace(/,1$/, ",")}\n${row.replace(",10,5,", ",10.0,5.00,").replace(/,1$/, ",")}`);
  assert.equal(duplicate.duplicates.length, 1); assert.throws(() => adoptPreview(duplicate, [], [], []));
  const kept = adoptPreview(duplicate, [3], [duplicate.duplicates[0].key], [duplicate.orders[0].key]);
  assert.equal(kept.trades.length, 1); assert.deepEqual(kept.import_batches[0].excluded_rows, [3]);
  const conflict = parse(`${header}\n${row.replace(/,1$/, ",2")}\n${row.replace("10:00:00", "11:00:00")}`);
  assert.ok(conflict.errors.some((error) => error.code === "ORDER_CONFLICT"));
  const mixed = parse(`${header}\n${row.replace("10:00:00", "11:00:00").replace(/,1$/, ",")}\n${row.replace("10:00:00", "").replace(/,1$/, ",")}\n${row.replace(/,1$/, ",")}`);
  assert.ok(mixed.errors.some((error) => error.code === "ORDER_CONFLICT"));
});

test("storage roundtrip retains complete case and chosen reason; conflict and quota failure preserve originals", () => {
  let raw: string | null = null;
  const store = { getItem: (key: string) => key === STORAGE_KEY ? raw : null, setItem: (_key: string, value: string) => { raw = value; } };
  const demo = loadDemo(); demo.active_reason_id = demo.reasons[1].reason_id;
  const saved = saveDataset(store, demo, null); assert.deepEqual(decodeDataset(saved), demo);
  assert.throws(() => saveDataset(store, loadDemo(), null), /另一标签页/); assert.equal(raw, saved);
  const failing = { getItem: () => saved, setItem: () => { throw new Error("QuotaExceededError"); } };
  assert.throws(() => saveDataset(failing, loadDemo(), saved), /Quota/);
  assert.throws(() => decodeDataset("{broken")); assert.throws(() => decodeDataset(JSON.stringify({ ...demo, schema_version: "999" })));
});

const reasonInput = (trade_id: string): ReasonInput => ({ trade_id, record_type: "recollection", judgment: "用户亲自补充的过程记录", expected_evidence: "", invalidation_condition: "", source_excerpt: "用户原始摘录", source_name: "用户日记", source_url: "", time_precision: "unknown", formed_date: "", formed_time: "", historical_version_confirmed: false });

test("reason input appends original fields without fabricating historical timestamps or replacing fixture reasons", () => {
  const original = loadDemo();
  const next = appendReason(original, reasonInput(original.trades[0].trade_id), now, "user-reason-id");
  assert.equal(original.reasons.length, 2); assert.equal(next.reasons.length, 3);
  assert.deepEqual(next.reasons.slice(0, 2), original.reasons);
  const saved = next.reasons[2];
  assert.equal(saved.source_excerpt, "用户原始摘录"); assert.equal(saved.formed_at, null); assert.equal(saved.formed_date, null);
  assert.equal(saved.evidence.first_available.precision, "unknown"); assert.equal(saved.evidence.fetched_at, null);
  assert.equal(saved.evidence.source_type, "user_provided"); assert.equal(saved.is_constructed, true); assert.equal(saved.created_at, now);
  assert.equal(saved.record_type, "recollection"); assert.equal(next.active_reason_id, "user-reason-id");
  assert.deepEqual(decodeDataset(JSON.stringify(next)), next);
});

test("user-provided reason retains only supplied historical date/time and real inputs stay unverified", () => {
  const real = adoptPreview(parse(`${header}\n${row.replace("DEMO001", "600519.SH")}`, "real"), [], [], []);
  const input = { ...reasonInput(real.trades[0].trade_id), record_type: "contemporaneous" as const, time_precision: "date" as const, formed_date: "2025-03-03" };
  const dated = appendReason(real, input, now, "dated-reason").reasons[0];
  assert.equal(dated.formed_date, "2025-03-03"); assert.equal(dated.formed_at, null);
  assert.equal(dated.evidence.source_type, "user_provided"); assert.equal(dated.evidence.quality.status, "unverified");
  const exact = appendReason(real, { ...input, time_precision: "datetime", formed_time: "09:30" }, now, "exact-reason").reasons[0];
  assert.equal(exact.formed_at, "2025-03-03T09:30:00+08:00");
  assert.throws(() => appendReason(real, { ...input, source_url: "javascript:alert(1)" }));
  assert.throws(() => appendReason(real, { ...input, trade_id: "missing-trade" }));
  assert.throws(() => appendReason(real, { ...input, judgment: "  " }));
});

test("unified timeline projects every original record once and all classifications remain pending", () => {
  const original = loadDemo(); const entries = unifiedEvidence(original);
  assert.equal(entries.length, 9); assert.equal(new Set(entries.map((entry) => entry.id)).size, 9);
  assert.deepEqual(entries.map((entry) => entry.date), ["2025-02-28", "2025-03-02", "2025-03-03", "2025-03-03", "2025-03-03", "2025-03-03", "2025-03-03", "2025-03-10", "2025-03-11"]);
  assert.ok(entries.every((entry) => entry.time_class === "pending"));
  const dateOnly = entries.find((entry) => entry.id === "evidence-demo001-event-date-only")!;
  assert.equal(dateOnly.at, null); assert.equal(dateOnly.precision, "date");
  const bar = entries.find((entry) => entry.id === "evidence-demo001-bar-buy-day")!;
  assert.equal(bar.at, null); assert.equal(bar.record.evidence.first_available.at, "2025-03-03T18:00:00+08:00");
  assert.deepEqual(bar.record, original.market_bars[1]);
  const unknown = appendReason(original, reasonInput(original.trades[0].trade_id), now, "unknown-reason");
  assert.equal(unifiedEvidence(unknown).at(-1)!.date, null);
});

const eventInput = (symbol: string): EventInput => ({ symbol, title: "用户提供的测试资料", excerpt: "  用户上传原文\n保留换行  ", source_name: "用户持有的测试文本", source_url: "", published_date: "", published_time: "", time_precision: "unknown", historical_version_confirmed: false, filename: "evidence.txt" });

test("uploaded evidence preserves text and source, never becomes provider API and does not fabricate first availability", () => {
  const real = adoptPreview(parse(`${header}\n${row.replace("DEMO001", "600519.SH")}`, "real"), [], [], []);
  const next = appendEvent(real, eventInput("600519.SH"), now, "user-event");
  assert.equal(real.events.length, 0); assert.equal(next.events.length, 1);
  const event = next.events[0];
  assert.equal(event.evidence.source_type, "user_provided"); assert.equal(event.evidence.quality.status, "unverified");
  assert.equal(event.excerpt, eventInput("600519.SH").excerpt); assert.equal(event.evidence.fetched_at, null);
  assert.equal(event.published_date, null); assert.equal(event.published_at, null); assert.equal(event.evidence.first_available.precision, "unknown");
  assert.match(event.evidence.source_reference, /evidence\.txt/);
  assert.equal(classifyEvidence(next, next.trades[0].trade_id).find((entry) => entry.id === event.evidence.evidence_id)!.time_class, "unknown");
  assert.deepEqual(decodeDataset(JSON.stringify(next)), next);
});

test("user-uploaded constructed evidence stays unverified; date-only and unverified old versions retain conservative classification", () => {
  const demo = loadDemo(); const input = { ...eventInput("DEMO001"), time_precision: "date" as const, published_date: "2025-03-03", historical_version_confirmed: true };
  const next = appendEvent(demo, input, now, "synthetic-event"), event = next.events.at(-1)!;
  assert.equal(event.evidence.source_type, "user_provided"); assert.equal(event.evidence.quality.status, "unverified"); assert.equal(event.is_constructed, true);
  assert.equal(event.published_at, null); assert.equal(event.evidence.first_available.at, null);
  assert.equal(classifyEvidence(next, demo.trades[0].trade_id).find((entry) => entry.id === event.evidence.evidence_id)!.time_class, "unknown");
  const old = appendEvent(demo, { ...input, published_date: "2025-02-28", historical_version_confirmed: false }, now, "unconfirmed-event");
  assert.equal(classifyEvidence(old, demo.trades[0].trade_id).find((entry) => entry.id === "evidence-unconfirmed-event")!.time_class, "unknown");
  assert.throws(() => appendEvent(demo, { ...input, symbol: "600519.SH" }));
  assert.throws(() => appendEvent(demo, { ...input, source_url: "javascript:alert(1)" }));
  assert.throws(() => appendEvent(demo, { ...input, excerpt: " " }));
});

test("TXT upload checks UTF-8, type, size and excerpt limit without silent truncation", () => {
  assert.equal(decodeEvidenceText(bytes("\uFEFF原文\n第二行"), "source.TXT"), "原文\n第二行");
  assert.throws(() => decodeEvidenceText(bytes("原文"), "source.pdf"));
  assert.throws(() => decodeEvidenceText(new Uint8Array([255]), "source.txt"));
  assert.throws(() => decodeEvidenceText(new Uint8Array(64 * 1024 + 1), "source.txt"));
  assert.throws(() => decodeEvidenceText(bytes("x".repeat(2001)), "source.txt"));
  assert.throws(() => decodeEvidenceText(bytes(" \n "), "source.txt"));
});

test("manual acceptance CSV files retain constructed user provenance and known versus missing cash fees", () => {
  for (const [filename, missing] of [["trades-closed.csv", false], ["trades-missing-fee.csv", true]] as const) {
    const preview = parse(readFileSync(`docs/acceptance-fixtures/${filename}`, "utf8"), "constructed", filename);
    assert.deepEqual(preview.errors, []); assert.equal(preview.warnings.length, missing ? 2 : 0);
    const dataset = adoptPreview(preview, [], [], []);
    assert.deepEqual(dataset.trades.map((trade) => trade.trade_at), ["2025-03-10T10:00:00+08:00", "2025-03-12T14:00:00+08:00"]);
    for (const trade of dataset.trades) {
      assert.equal(trade.is_constructed, true); assert.equal(trade.evidence.source_type, "user_provided");
      assert.equal(trade.evidence.quality.status, "unverified"); assert.match(trade.name, /构造验收材料/);
      assert.equal(trade.fee, missing ? null : "5");
    }
    const positions = recognizePositions(dataset.trades); assert.deepEqual(positions.issues, []);
    assert.equal(positions.processes.length, 1); assert.equal(positions.processes[0].status, "closed");
    assert.equal(positions.processes[0].quantity, 0n);
    const cash = calculateCash(positions.processes[0]);
    assert.equal(cash.buy_cents, 100000n); assert.equal(cash.sell_cents, 90000n);
    assert.equal(cash.gross_pnl_cents, -10000n); assert.equal(cash.net_pnl_cents, missing ? null : -11000n);
    assert.equal(cash.total_fee_cents, missing ? null : 1000n); assert.equal(cash.missing_fee_count, missing ? 2 : 0);
    assert.equal(cash.status, "provisional"); assert.deepEqual(decodeDataset(JSON.stringify(dataset)), dataset);
  }
});

test("manual acceptance TXT files classify 1/3/1 without converting date-only, entry time or version claims into verified facts", () => {
  let dataset = adoptPreview(parse(readFileSync("docs/acceptance-fixtures/trades-closed.csv", "utf8")), [], [], []);
  for (const [filename, precision, time] of [["event-before.txt", "datetime", "09:30:00"], ["event-after.txt", "datetime", "18:00:00"], ["event-date-only.txt", "date", ""]] as const) {
    const excerpt = decodeEvidenceText(readFileSync(`docs/acceptance-fixtures/${filename}`), filename);
    assert.match(excerpt, /构造验收材料/); assert.match(excerpt, /user_provided \/ unverified/);
    dataset = appendEvent(dataset, { ...eventInput("DEMO001"), title: filename, excerpt,
      published_date: "2025-03-10", published_time: time, time_precision: precision, historical_version_confirmed: true, filename }, now, filename);
  }
  const classes = classifyEvidence(dataset, dataset.trades[0].trade_id);
  assert.deepEqual(["prior", "post", "unknown"].map((kind) => classes.filter((entry) => entry.time_class === kind).length), [1, 3, 1]);
  for (const event of dataset.events) {
    assert.equal(event.is_constructed, true); assert.equal(event.evidence.source_type, "user_provided");
    assert.equal(event.evidence.quality.status, "unverified"); assert.equal(event.evidence.fetched_at, null);
    assert.equal(event.created_at, now);
    assert.equal(eventSchema.safeParse({ ...event, evidence: { ...event.evidence, quality: { ...event.evidence.quality, status: "verified" } } }).success, false);
    assert.equal(eventSchema.safeParse({ ...event, evidence: { ...event.evidence, source_type: "provider_api" } }).success, false);
    assert.equal(eventSchema.safeParse({ ...event, is_constructed: false }).success, false);
  }
  assert.equal(dataset.events[2].published_at, null); assert.equal(dataset.events[2].evidence.first_available.at, null);
  const unconfirmed = { ...dataset, events: dataset.events.map((event) => ({ ...event, historical_version_confirmed: false })) };
  assert.equal(classifyEvidence(unconfirmed, dataset.trades[0].trade_id).filter((entry) => entry.time_class === "prior").length, 0);
  assert.deepEqual(decodeDataset(JSON.stringify(dataset)), dataset);
});
