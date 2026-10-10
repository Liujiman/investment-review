import assert from "node:assert/strict";
import test from "node:test";
import { loadDemo } from "../src/lib/demo";
import { accept, assertCurrent, blankConfirmation, buildA, buildB, confirm, currentResult, entryFor, synchronize, task, verifyHash } from "../src/lib/review/engine";
import { canonical, digest, outputSchema, parseStrict, pointer, validateContract } from "../src/lib/review/json";
import { decodeReview, saveReview } from "../src/lib/review/store";
import { validA, validB } from "./fixtures/review-outputs";

async function baseline(mutate?: (dataset: ReturnType<typeof loadDemo>) => void) {
  const dataset = loadDemo(); mutate?.(dataset);
  const ledger = await synchronize(null, dataset), entry = entryFor(ledger, dataset, dataset.trades[0].trade_id);
  confirm(entry, { opening_zero: true, complete: true, no_actions: true, scope: true, evidence_ids: [...dataset.events, ...dataset.market_bars].map((r) => r.evidence.evidence_id) });
  const a = await buildA(dataset, entry, dataset.trades[0].trade_id); entry.packages.push(a);
  return { dataset, ledger, entry, a };
}
async function withB(mutate?: Parameters<typeof baseline>[0]) {
  const base = await baseline(mutate), accepted = await accept(base.entry, base.a, JSON.stringify(validA(base.a)));
  base.ledger.entries = [accepted]; const b = await buildB(base.dataset, accepted, base.a); accepted.packages.push(b);
  return { ...base, entry: accepted, b };
}

test("A contains only three prior records, no execution, future, recall, unknown or metric; complete task schema is stage-pruned", async () => {
  const { a } = await baseline(); await verifyHash(a);
  assert.equal(a.evidence.length, 3); assert.ok(a.evidence.every((e) => e.time_class === "prior" && e.kind !== "trade" && e.kind !== "metric"));
  const raw = task(a);
  for (const forbidden of ["demo001-sell", "evidence-demo001-event-after", "demo001-reason-recollection", "demo001-event-date-only", "net_pnl", "outcome_review", "import_batches"]) assert.equal(raw.includes(forbidden), false, forbidden);
  assert.equal(canonical(a).includes('"created_at"'), false);
  assert.ok(raw.includes("A_output")); assert.ok(raw.includes(a.input_hash)); assert.ok(Object.isFrozen(a.evidence[0].values));
  assert.equal(JSON.stringify(outputSchema("prior_assessment")).includes("B_output"), false);
});
test("formal prerequisites gate task creation, including open process and unconfirmed evidence scope", async () => {
  const data = loadDemo(), ledger = await synchronize(null, data), entry = entryFor(ledger, data, data.trades[0].trade_id);
  await assert.rejects(buildA(data, entry, data.trades[0].trade_id), /confirmation/);
  confirm(entry, { ...blankConfirmation(), opening_zero: true, complete: true, no_actions: true });
  await assert.rejects(buildA(data, entry, data.trades[0].trade_id), /confirmation/);
  data.trades = [data.trades[0]];
  confirm(entry, { ...entry.confirmation, scope: true });
  await assert.rejects(buildA(data, entry, data.trades[0].trade_id), /尚未清仓/);
});
test("A source locator or excerpt cannot smuggle known future IDs and final profit", async () => {
  await assert.rejects(baseline((data) => { data.events[0].evidence.source_reference += "/demo001-sell"; }), /越阶段/);
  await assert.rejects(baseline((data) => { data.events[0].excerpt = "最终净盈亏为负，本句冒充事前材料。"; }), /最终结果/);
});
test("exact cutoff, date-only, same-day daily bar and early-dated recall never enter A", async () => {
  const { a } = await baseline((d) => {
    d.events[0].published_at = d.trades[0].trade_at; d.events[0].published_date = d.trades[0].trade_date;
    d.events[0].evidence.first_available.at = d.trades[0].trade_at; d.events[0].evidence.first_available.date = d.trades[0].trade_date;
    d.market_bars[1].evidence.first_available.at = "2025-03-03T08:00:00+08:00";
    d.reasons[1].formed_date = "2025-03-02"; d.reasons[1].formed_at = "2025-03-02T08:00:00+08:00";
    d.reasons[1].evidence.first_available.date = d.reasons[1].formed_date; d.reasons[1].evidence.first_available.at = d.reasons[1].formed_at;
  });
  assert.deepEqual(a.evidence.map((e) => e.record_id).sort(), ["demo001-bar-before", "demo001-reason-contemporaneous"]);
});
test("valid A is frozen once; B binds its exact snapshot and original result with a new package/hash", async () => {
  const { entry, a, b } = await withB();
  assert.deepEqual(b.prior_assessment, currentResult(entry, a)); assert.deepEqual(b.prior_evidence, a.evidence);
  assert.notEqual(a.package_id, b.package_id); assert.notEqual(a.input_hash, b.input_hash); await verifyHash(b);
  await assert.rejects(accept(entry, a, JSON.stringify(validA(a))), /已冻结/);
  const untouched = canonical(b.prior_assessment), accepted = await accept(entry, b, JSON.stringify(validB(b)));
  assert.equal(accepted.results.length, 2); assert.equal(canonical(b.prior_assessment), untouched);
});
test("B is blocked without frozen A, and rejects forged A or an altered prior binding", async () => {
  const base = await baseline(); await assert.rejects(buildB(base.dataset, base.entry, base.a), /缺少.*冻结A/);
  const { entry, b } = await withB(); const changed = structuredClone(b); changed.prior_input_hash = "0".repeat(64);
  await assert.rejects(accept(entry, changed, JSON.stringify(validB(changed))), /失效/);
});
test("metrics stay code-owned integer-cent cash with dependency IDs and never become prior", async () => {
  const { b } = await withB();
  assert.deepEqual(b.computed_metrics.map((m) => [m.metric_id, m.value]), [["buy_amount", "1000.00"], ["sell_amount", "900.00"], ["gross_pnl", "-100.00"], ["total_fees", "10.00"], ["net_pnl", "-110.00"]]);
  assert.ok(b.computed_metrics.every((m) => m.status === "provisional" && m.dependency_evidence_ids.every((id) => b.evidence.some((e) => e.evidence_id === id))));
  for (const visibility of Object.values(b.decision_visibility)) assert.ok(b.evidence.filter((e) => e.kind === "metric").every((e) => visibility.evidence[e.evidence_id].time_class === "post"));
});
test("missing fee preserves null totals/net, with zero only a known subtotal; unavailable never becomes success", async () => {
  const { entry, b } = await withB((d) => d.trades.forEach((trade) => { trade.fee = null; }));
  assert.equal(b.computed_metrics.find((m) => m.metric_id === "net_pnl")!.value, null);
  assert.equal(b.computed_metrics.find((m) => m.metric_id === "total_fees")!.status, "unknown");
  assert.ok(b.data_quality.some((text) => text.includes("unavailable") && text.includes("网络失败")));
  const output = validB(b); output.fact_findings[0].metric_ids = ["net_pnl"];
  await assert.rejects(accept(entry, b, JSON.stringify(output)), /未知指标/);
});
test("JSON parser rejects malformed, fenced, multiple, duplicate keys, oversized and nonfinite outputs", () => {
  for (const raw of ["{bad}", "```json\n{}\n```", "{}{}", '{"x":1,"x":2}', '{"nested":{"x":1,"x":2}}', '{"x":1e400}', "[]"]) assert.throws(() => parseStrict(raw));
  assert.throws(() => parseStrict(JSON.stringify({ x: "中".repeat(200000) })), /512KiB/);
});
test("unknown fields, wrong binding/stage and nonexistent evidence reject without changing valid results", async () => {
  const { entry, a } = await withB(); const before = canonical(entry);
  for (const change of [
    (v: ReturnType<typeof validA> & { net_pnl?: string }) => { v.net_pnl = "999"; },
    (v: ReturnType<typeof validA>) => { v.input_hash = "0".repeat(64); },
    (v: ReturnType<typeof validA>) => { v.decision_assessment.evidence_support[0].evidence_refs[0].evidence_id = "does-not-exist"; },
  ]) { const value = validA(a); change(value); await assert.rejects(accept(entry, a, JSON.stringify(value))); }
  assert.equal(canonical(entry), before);
});
test("cross-stage evidence IDs are distinct and cannot be cited from the other snapshot", async () => {
  const { entry, a, b } = await withB();
  const aOutput = validA(a); aOutput.decision_assessment.evidence_support[0].evidence_refs[0].evidence_id = b.evidence[0].evidence_id;
  await assert.rejects(accept(entry, a, JSON.stringify(aOutput)), /跨阶段/);
  const bOutput = validB(b); bOutput.fact_findings[0].evidence_refs[0].evidence_id = a.evidence[0].evidence_id;
  await assert.rejects(accept(entry, b, JSON.stringify(bOutput)), /跨阶段/);
});
test("JSON Pointer resolves escaped keys and rejects wrong roots, prototype traversal, null and containers", () => {
  assert.equal(pointer({ fields: { "a/b~c": "origin" }, zero: 0 }, "/fields/a~1b~0c"), "origin");
  assert.equal(pointer({ zero: 0 }, "/zero"), 0);
  for (const path of ["/values/x", "/missing", "/__proto__/x", "/a/01", "/a/2", "/null", "/a", "/bad~2"]) assert.throws(() => pointer({ a: [1], null: null }, path));
});
test("unknown/null references, recall as prior and per-decision visibility violations reject", async () => {
  const { entry, b } = await withB();
  const unknown = b.evidence.find((e) => e.record_id === "demo001-event-date-only")!, recall = b.evidence.find((e) => e.record_id === "demo001-reason-recollection")!, after = b.evidence.find((e) => e.record_id === "demo001-event-after")!;
  for (const [evidence, path] of [[unknown, "/excerpt"], [recall, "/judgment"], [after, "/excerpt"]] as const) {
    const out = validB(b); out.fact_findings[0].evidence_refs = [{ evidence_id: evidence.evidence_id, field_path: path, usage: "prior_basis" }];
    await assert.rejects(accept(entry, b, JSON.stringify(out)));
  }
  const sell = validB(b); sell.fact_findings[0].decision_trade_id = "demo001-sell"; sell.fact_findings[0].evidence_refs = [{ evidence_id: after.evidence_id, field_path: "/excerpt", usage: "prior_basis" }];
  await accept(entry, b, JSON.stringify(sell));
  const missing = await withB((d) => d.trades.forEach((t) => { t.fee = null; }));
  const nullRef = validB(missing.b); nullRef.fact_findings[0].evidence_refs[0].field_path = "/fee";
  await assert.rejects(accept(missing.entry, missing.b, JSON.stringify(nullRef)), /未知/);
});
test("hypotheses need qualification and alternatives; numbers, deterministic advice and extra amount fields reject", async () => {
  const { entry, b } = await withB();
  for (const statement of ["现金净盈亏为-110元", "亏损一百元", "收益率是十成", "应该买入该证券", "该事件导致下跌", "亏损证明判断错误"]) {
    const out = validB(b); out.summary = statement; await assert.rejects(accept(entry, b, JSON.stringify(out)));
  }
  const hypothesis = validB(b); hypothesis.behavior_hypotheses = [{ ...hypothesis.fact_findings[0], finding_id: "hypothesis", statement: "可能存在未记录的过程假设，待确认。", alternative_explanations: [] }];
  await assert.rejects(accept(entry, b, JSON.stringify(hypothesis)), /契约/);
});
test("duplicate finding IDs, unknown metric IDs and learning linked to A/nonexistent finding reject", async () => {
  const { entry, b } = await withB();
  for (const mutate of [
    (o: ReturnType<typeof validB>) => { o.uncertainties[0].finding_id = o.fact_findings[0].finding_id; },
    (o: ReturnType<typeof validB>) => { o.fact_findings[0].metric_ids = ["invented-metric"]; },
    (o: ReturnType<typeof validB>) => { o.learning_items[0].related_finding_ids = ["a-observation"]; },
  ]) { const out = validB(b); mutate(out); await assert.rejects(accept(entry, b, JSON.stringify(out))); }
});
test("changes to reason, trade fee/time or event invalidate results; original snapshots survive", async () => {
  for (const mutate of [
    (d: ReturnType<typeof loadDemo>) => { d.reasons[0].judgment += "补充"; },
    (d: ReturnType<typeof loadDemo>) => { d.trades[0].fee = "6"; },
    (d: ReturnType<typeof loadDemo>) => { d.trades[0].trade_at = "2025-03-03T11:00:00+08:00"; },
    (d: ReturnType<typeof loadDemo>) => { d.events[0].excerpt += "补充"; },
  ]) {
    const { dataset, ledger, entry, a } = await withB(); const original = canonical(entry.packages[0]);
    mutate(dataset); const next = await synchronize(ledger, dataset);
    assert.equal(next.entries[0].revision, entry.revision + 1); assert.deepEqual(next.entries[0].confirmation, blankConfirmation());
    assert.throws(() => assertCurrent(next.entries[0], a), /失效/); assert.equal(canonical(next.entries[0].packages[0]), original);
  }
});
test("new A task invalidates prior B; switching decision does not increment revision or adopt other-decision output", async () => {
  const { dataset, entry, a, b } = await withB(), revision = entry.revision;
  const sellA = await buildA(dataset, entry, "demo001-sell"); entry.packages.push(sellA);
  assert.equal(entry.revision, revision); assertCurrent(entry, a);
  await assert.rejects(accept(entry, sellA, JSON.stringify(validA(a))), /绑定/);
  const nextA = await buildA(dataset, entry, a.decision_trade_id); entry.packages.push(nextA);
  await assert.rejects(accept(entry, b, JSON.stringify(validB(b))), /A任务已更新/);
});
test("canonical hashes preserve array order and nested hashes; schema rejects spoofing even with valid JSON", async () => {
  assert.equal(await digest({ b: 2, a: 1 }), await digest({ a: 1, b: 2 }));
  assert.notEqual(await digest([1, 2]), await digest([2, 1]));
  const { b } = await withB(), change = structuredClone(b); change.prior_input_hash = "f".repeat(64);
  await assert.rejects(verifyHash(change), /哈希/);
  const a = { ...b, stage: "prior_assessment" }; assert.throws(() => validateContract("A_input", a));
});
test("ledger roundtrip preserves frozen inputs/results; quota and conflict cannot claim persistence", async () => {
  const { ledger, entry, b } = await withB(); ledger.entries = [await accept(entry, b, JSON.stringify(validB(b)))];
  let raw: string | null = null; const store = { getItem: () => raw, setItem: (_key: string, value: string) => { raw = value; } };
  const saved = saveReview(store, ledger, null); assert.deepEqual(await decodeReview(saved), ledger);
  assert.throws(() => saveReview(store, ledger, null), /另一标签页/);
  assert.throws(() => saveReview({ getItem: () => saved, setItem: () => { throw new Error("QuotaExceededError"); } }, ledger, saved), /Quota/);
  const forged = JSON.parse(saved); forged.entries[0].packages[0].input_hash = "0".repeat(64);
  await assert.rejects(decodeReview(JSON.stringify(forged)), /哈希/);
});
test("empty prior evidence permits only explicit limited A, not invented support", async () => {
  const { dataset, ledger } = await baseline(); dataset.events = []; dataset.market_bars = []; dataset.reasons = []; dataset.active_reason_id = null;
  const synced = await synchronize(ledger, dataset), entry = entryFor(synced, dataset, "demo001-buy");
  confirm(entry, { ...blankConfirmation(), opening_zero: true, complete: true, no_actions: true, scope: true });
  const a = await buildA(dataset, entry, "demo001-buy"); entry.packages.push(a); assert.equal(a.evidence.length, 0);
  await accept(entry, a, JSON.stringify(validA(a)));
});
