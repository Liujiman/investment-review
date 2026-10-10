import assert from "node:assert/strict";
import test from "node:test";
import { loadDemo } from "../src/lib/demo";
import { accept, buildA, buildB, confirm, entryFor, synchronize } from "../src/lib/review/engine";
import { validA, validB } from "./fixtures/review-outputs";
import { digest } from "../src/lib/review/json";
import { decodeBoard, emptyBoard, exportBoard, importBoard, LEARNING_KEY, makeSource, MAX_BYTES, newTemplate, persistBoard, prepareSave, relatedFindings, sourceReport, sourceState, startDecision, templateState, validateCompletion } from "../src/lib/learning/board";

async function setup() {
  const dataset = loadDemo(), ledger = await synchronize(null, dataset), initial = entryFor(ledger, dataset, dataset.trades[0].trade_id);
  confirm(initial, { opening_zero: true, complete: true, no_actions: true, scope: true, evidence_ids: [...dataset.events, ...dataset.market_bars].map((e) => e.evidence.evidence_id) });
  const a = await buildA(dataset, initial, dataset.trades[0].trade_id); initial.packages.push(a);
  const frozen = await accept(initial, a, JSON.stringify(validA(a))), b = await buildB(dataset, frozen, a); frozen.packages.push(b);
  const accepted = await accept(frozen, b, JSON.stringify(validB(b))); ledger.entries = [accepted];
  const source = await makeSource(ledger, accepted, b), t = newTemplate(source), board = emptyBoard(); board.sources.push(source); board.checklists.push(t);
  return { dataset, ledger, b, source, t, board };
}
test("candidate selection/edit/check persists provenance and original report remains immutable", async () => {
  const { board, t, source, ledger } = await setup(), raw = JSON.stringify(source);
  assert.equal(t.items[0].selected, false);
  const item = t.items[0]; item.selected = true; item.checked = true; item.question = "核验前是否保存原始材料？"; item.user_edited = true;
  const saved = await prepareSave(board, emptyBoard(), ledger), restored = await decodeBoard(JSON.stringify(saved));
  assert.equal(restored.checklists[0].items[0].question, item.question); assert.equal(restored.checklists[0].items[0].checked, true);
  assert.equal(restored.checklists[0].items[0].user_edited, true); assert.equal(JSON.stringify(restored.sources[0]), raw);
  const related = relatedFindings(item, restored)!; assert.equal(related.findings[0].finding_id, "b-execution");
  assert.equal(related.source.report_id, source.report_id); assert.equal(sourceReport(source).input.episode_revision, sourceReport(restored.sources[0]).input.episode_revision);
  assert.ok(sourceReport(restored.sources[0]).input.evidence.some((e) => e.is_constructed));
});
test("editing and deleting template increments version without rewriting existing decision snapshot", async () => {
  const { board, ledger } = await setup(); board.checklists[0].items[0].selected = true;
  const saved = await prepareSave(board, emptyBoard(), ledger), original = saved.checklists[0];
  saved.decisions.push(startDecision(original, saved, ledger, false));
  const first = await prepareSave(saved, emptyBoard(), ledger), snapshot = JSON.stringify(first.decisions[0].checklist_snapshot);
  const edited = structuredClone(first); edited.checklists[0].items[0].question = "编辑后的构造检查问题"; edited.checklists[0].items[0].user_edited = true;
  const second = await prepareSave(edited, first, ledger); assert.equal(second.checklists[0].version, 2); assert.equal(JSON.stringify(second.decisions[0].checklist_snapshot), snapshot);
  const deleted = structuredClone(second); deleted.checklists = []; const third = await prepareSave(deleted, second, ledger);
  assert.equal(JSON.stringify(third.decisions[0].checklist_snapshot), snapshot); assert.equal(third.sources.length, 1);
  const restored = await importBoard(await exportBoard(third, false)); assert.equal(restored.checklists.length, 0); assert.equal(restored.decisions[0].checklist_version, 1);
});
test("completed decision requires reason/counterevidence/checks; no action or recommendation field", async () => {
  const { board, ledger, t } = await setup(); t.items[0].selected = true; const d = startDecision(t, board, ledger, false);
  assert.throws(() => validateCompletion(d), /理由和反证/); d.judgment = "仅记录用户判断"; d.invalidation_condition = "若原资料无法独立核验则重新评估";
  assert.throws(() => validateCompletion(d), /逐项检查/); d.answers[0].status = "not_applicable"; assert.throws(() => validateCompletion(d), /不适用/);
  d.answers[0].note = "本构造案例不涉及该项"; validateCompletion(d); d.status = "completed"; board.decisions.push(d);
  const saved = await prepareSave(board, emptyBoard(), ledger), attempt = structuredClone(saved); attempt.decisions[0].judgment = "未经退回直接修改";
  await assert.rejects(prepareSave(attempt, saved, ledger), /先退回草稿/);
  attempt.decisions[0].status = "draft"; await assert.rejects(prepareSave(attempt, saved, ledger), /先退回草稿/);
  const back = structuredClone(saved); back.decisions[0].status = "draft"; const reopened = await prepareSave(back, saved, ledger);
  const changed = structuredClone(reopened); changed.decisions[0].judgment = "退回草稿后的用户判断"; await prepareSave(changed, reopened, ledger);
  const bad = structuredClone(saved) as unknown as { decisions: Record<string, unknown>[] }; bad.decisions[0].planned_action = "BUY";
  await assert.rejects(decodeBoard(JSON.stringify(bad)), /Unrecognized key/);
});
test("source expiry and unavailable data preserve labels; explicit acknowledgement needed for old or absent source", async () => {
  const { board, t, source, dataset, ledger } = await setup(); t.items[0].selected = true;
  assert.equal(sourceState(source, ledger), "current"); assert.equal(sourceState(source, null), "unconfirmed");
  dataset.reasons[0].judgment = "新的构造理由"; const changed = await synchronize(ledger, dataset);
  assert.equal(sourceState(source, changed), "expired"); assert.throws(() => startDecision(t, board, changed, false), /须明确确认/);
  assert.equal(startDecision(t, board, changed, true).source_status_at_start, "expired");
  t.items[0].origin = null; assert.equal(templateState(t, board, ledger), "unconfirmed"); assert.equal(relatedFindings(t.items[0], board), null);
  assert.throws(() => startDecision(t, board, ledger, false), /须明确确认/);
  assert.equal(startDecision(t, board, ledger, true).source_status_at_start, "unconfirmed");
  assert.ok(sourceReport(source).input.data_quality.some((s) => s.includes("unavailable")));
});
test("export/import contains full validated report and evidence versions, user edits, scope and unsaved marker", async () => {
  const { board, t } = await setup(); t.items[0].selected = true; t.scope.description = "仅适用于核验构造资料的记录过程";
  const raw = await exportBoard(board, true); assert.equal(JSON.parse(raw).persistence, "unsaved_draft");
  const imported = await importBoard(raw); assert.deepEqual(imported, board); assert.equal(imported.sources[0].review.entries[0].packages.length, 2);
  assert.equal(imported.sources[0].review.entries[0].results.length, 2);
  assert.ok(sourceReport(imported.sources[0]).input.evidence.some((e) => "evidence" in e.values));
});
test("wrong JSON/schema/duplicate key/foreign IDs/hash and lost edit marker reject without repair", async () => {
  const { board } = await setup();
  for (const raw of ["not json", "[]", '{"version":"x","version":"y"}', '{"format":"legacy"}']) await assert.rejects(importBoard(raw));
  const bad = structuredClone(board); bad.checklists[0].items[0].origin!.learning_id = "not-present"; await assert.rejects(decodeBoard(JSON.stringify(bad)), /不存在/);
  const changed = structuredClone(board); changed.sources[0].review.entries[0].packages[1].input_hash = "0".repeat(64); await assert.rejects(decodeBoard(JSON.stringify(changed)), /SHA|哈希|hash/);
  const edited = structuredClone(board); edited.checklists[0].items[0].question = "已改变但假称没有用户编辑"; await assert.rejects(decodeBoard(JSON.stringify(edited)), /user_edited/);
  const version = structuredClone(board); version.checklists[0].items[0].selected = true; const d = startDecision(version.checklists[0], version, null, true); d.checklist_version++; version.decisions.push(d); await assert.rejects(decodeBoard(JSON.stringify(version)), /版本/);
  const dup = structuredClone(board); dup.checklists.push(structuredClone(dup.checklists[0])); await assert.rejects(decodeBoard(JSON.stringify(dup)), /重复/);
});
test("missing provenance stays explicit; claimed missing report refuses instead of inventing source", async () => {
  const { board } = await setup(); board.checklists[0].items[0].origin = null; board.sources = [];
  const raw = await exportBoard(board, false); assert.ok(JSON.parse(raw).warnings[0].includes("缺少报告来源"));
  const restored = await importBoard(raw); assert.equal(restored.sources.length, 0); assert.equal(restored.checklists[0].items[0].origin, null);
  board.checklists[0].items[0].origin = { report_id: "missing", learning_id: "missing" }; await assert.rejects(decodeBoard(JSON.stringify(board)), /不存在/);
});
test("even rehashed backup cannot override code-owned cash metrics", async () => {
  const { board } = await setup();
  const bad = structuredClone(board), source = bad.sources[0], { input, result } = sourceReport(source);
  input.computed_metrics.find((m) => m.metric_id === "net_pnl")!.value = "999999.00";
  input.evidence.find((e) => e.record_id === "net_pnl")!.values.value = "999999.00";
  input.input_hash = await digest(Object.fromEntries(Object.entries(input).filter(([key]) => key !== "input_hash")));
  result.output.input_hash = input.input_hash; result.raw = JSON.stringify(result.output);
  source.report_id = `report-${await digest({ package_id: result.package_id, raw: result.raw })}`; bad.checklists[0].items[0].origin!.report_id = source.report_id;
  await assert.rejects(decodeBoard(JSON.stringify(bad)), /程序金额/);
});
test("storage unavailable/quota/readback failure/cross-tab conflict never confirms persistence", async () => {
  const { board } = await setup(), values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  const raw = persistBoard(storage, board, null); assert.equal(raw, values.get(LEARNING_KEY));
  assert.throws(() => persistBoard(storage, board, null), /另一标签页/); assert.equal(values.get(LEARNING_KEY), raw);
  for (const name of ["SecurityError", "QuotaExceededError"]) assert.throws(() => persistBoard({ getItem: () => null, setItem: () => { throw new DOMException("模拟失败", name); } }, board, null), /模拟失败/);
  assert.throws(() => persistBoard({ getItem: () => null, setItem: () => {} }, board, null), /回读/);
  const oversized = structuredClone(board); oversized.checklists[0].items[0].why = "x".repeat(MAX_BYTES);
  assert.throws(() => persistBoard(storage, oversized, raw), /容量上限/); assert.equal(values.get(LEARNING_KEY), raw);
});
test("oversized imports and exports reject without truncating sources", async () => {
  await assert.rejects(importBoard(" ".repeat(MAX_BYTES + 1)), /上限/);
  const board = emptyBoard(); board.checklists = new Array(101).fill({}); await assert.rejects(decodeBoard(JSON.stringify(board)));
});
