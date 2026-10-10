import { z } from "zod";
import { canonical, digest, parseStrict } from "../review/json";
import { decodeReview } from "../review/store";
import type { BInput, BOutput, Entry, Ledger, Learning, ReviewFinding } from "../review/engine";
import { calculateCash, formatCents, recognizePositions } from "../domain/positions";

export const LEARNING_KEY = "investment-review:learning-board:v1";
export const MAX_BYTES = 8 * 1024 * 1024;
const text = z.string().min(1).max(2000).refine((s) => Boolean(s.trim()), "不能为空白"), id = z.string().min(1).max(200);
const timestamp = z.iso.datetime({ offset: true });
const state = z.enum(["current", "expired", "unconfirmed"]);
const originSchema = z.strictObject({ report_id: id, learning_id: id }).nullable();
const itemSchema = z.strictObject({ item_id: id, question: text, why: z.string().max(2000), required_evidence: z.array(text).max(30), selected: z.boolean(), checked: z.boolean(), user_edited: z.boolean(), origin: originSchema });
const scopeSchema = z.strictObject({ kind: z.enum(["process", "symbol", "general"]), symbol: z.string().max(40).nullable(), description: text });
const templateSchema = z.strictObject({ checklist_id: id, name: text, version: z.number().int().positive(), scope: scopeSchema, items: z.array(itemSchema).max(100), source_status_at_save: state, created_at: timestamp, updated_at: timestamp });
const answerSchema = z.strictObject({ item_id: id, status: z.enum(["unanswered", "met", "not_met", "not_applicable"]), note: z.string().max(2000), evidence_text: z.string().max(2000) });
const decisionSchema = z.strictObject({ decision_id: id, checklist_id: id, checklist_version: z.number().int().positive(), checklist_snapshot: templateSchema, judgment: z.string().max(2000), invalidation_condition: z.string().max(2000), answers: z.array(answerSchema).max(100), status: z.enum(["draft", "completed"]), source_status_at_start: state, created_at: timestamp, updated_at: timestamp });
const boardSchema = z.strictObject({ version: z.literal("learning-board-v1"), revision: z.number().int().nonnegative(), updated_at: timestamp, sources: z.array(z.strictObject({ report_id: id, review: z.unknown() })).max(25), checklists: z.array(templateSchema).max(100), decisions: z.array(decisionSchema).max(200) });
export type Item = z.infer<typeof itemSchema>;
export type Template = z.infer<typeof templateSchema>;
export type Decision = z.infer<typeof decisionSchema>;
export type Source = { report_id: string; review: Ledger };
export type Board = Omit<z.infer<typeof boardSchema>, "sources"> & { sources: Source[] };
export type SourceState = z.infer<typeof state>;
export const now = () => new Date().toISOString();
export function emptyBoard(): Board { return { version: "learning-board-v1", revision: 0, updated_at: now(), sources: [], checklists: [], decisions: [] }; }
export function sourceReport(source: Source) {
  const entry = source.review.entries[0];
  const result = entry.results.find((r) => r.output.stage === "outcome_review")!;
  const input = entry.packages.find((p) => p.package_id === result.package_id) as BInput;
  return { entry, result, input, output: result.output as BOutput };
}
export async function makeSource(ledger: Ledger, entry: Entry, input: BInput): Promise<Source> {
  const result = entry.results.find((r) => r.package_id === input.package_id);
  const a = entry.packages.find((p) => p.package_id === input.prior_package_id);
  const ar = entry.results.find((r) => r.package_id === input.prior_package_id);
  if (!result || !a || !ar) throw new Error("缺少原报告或冻结A来源，不能生成清单来源。");
  const review: Ledger = { ...ledger, entries: [{ ...entry, packages: [a, input], results: [ar, result] }] };
  await decodeReview(JSON.stringify(review));
  return { report_id: `report-${await digest({ package_id: result.package_id, raw: result.raw })}`, review: structuredClone(review) };
}
export function sourceState(source: Source, current: Ledger | null): SourceState {
  if (!current) return "unconfirmed";
  const { entry, input, result } = sourceReport(source);
  const live = current.entries.find((e) => e.episode_id === entry.episode_id);
  if (!live || current.dataset_fingerprint !== source.review.dataset_fingerprint || live.revision !== input.episode_revision) return "expired";
  const latest = live.packages.findLast((p) => p.stage === "outcome_review" && p.decision_trade_id === input.decision_trade_id && p.episode_revision === live.revision);
  const latestA = live.packages.findLast((p) => p.stage === "prior_assessment" && p.decision_trade_id === input.decision_trade_id && p.episode_revision === live.revision);
  return latest?.package_id === input.package_id && latestA?.package_id === input.prior_package_id && live.results.some((r) => r.package_id === input.package_id && r.raw === result.raw) ? "current" : "expired";
}
export function templateState(template: Template, board: Board, current: Ledger | null): SourceState {
  const ids = [...new Set(template.items.filter((i) => i.selected && i.origin).map((i) => i.origin!.report_id))];
  const states = ids.map((id) => { const source = board.sources.find((s) => s.report_id === id); return source ? sourceState(source, current) : "unconfirmed"; });
  if (states.includes("expired")) return "expired";
  return !states.length || states.includes("unconfirmed") || template.items.some((i) => i.selected && !i.origin) ? "unconfirmed" : "current";
}
export function newTemplate(source: Source): Template {
  const { input, output } = sourceReport(source), at = now();
  return { checklist_id: `checklist-${crypto.randomUUID()}`, name: "待确认学习清单", version: 1, scope: { kind: "process", symbol: input.symbol, description: `来源过程 ${input.episode_id} 修订${input.episode_revision}；适用边界需用户确认` },
    items: output.learning_items.map((i: Learning) => ({ item_id: `item-${crypto.randomUUID()}`, question: i.question, why: i.why, required_evidence: [...i.required_evidence], selected: false, checked: false, user_edited: false, origin: { report_id: source.report_id, learning_id: i.learning_id } })), source_status_at_save: "current", created_at: at, updated_at: at };
}
function unique(ids: string[], label: string) { if (new Set(ids).size !== ids.length) throw new Error(`${label}ID重复`); }
export function validateCompletion(d: Decision) {
  if (!d.judgment.trim() || !d.invalidation_condition.trim()) throw new Error("完成记录需要填写决策理由和反证条件。");
  if (!d.answers.length || d.answers.some((a) => a.status === "unanswered" || (a.status === "not_applicable" && !a.note.trim()))) throw new Error("完成记录需要逐项检查；不适用项必须填写说明。");
}
export async function decodeBoard(raw: string): Promise<Board> {
  const parsed = boardSchema.parse(parseStrict(raw, MAX_BYTES));
  unique(parsed.sources.map((s) => s.report_id), "报告"); unique(parsed.checklists.map((c) => c.checklist_id), "清单"); unique(parsed.decisions.map((d) => d.decision_id), "决策");
  const sources: Source[] = [];
  for (const s of parsed.sources) {
    const review = await decodeReview(JSON.stringify(s.review));
    if (review.entries.length !== 1 || review.entries[0].packages.length !== 2 || review.entries[0].results.length !== 2 || review.entries[0].results.filter((r) => r.output.stage === "outcome_review").length !== 1) throw new Error("报告来源必须含唯一B及原冻结A快照。");
    const source = { report_id: s.report_id, review }, { result, input } = sourceReport(source);
    if (s.report_id !== `report-${await digest({ package_id: result.package_id, raw: result.raw })}`) throw new Error("来源报告ID与原JSON不匹配。");
    const recognized = recognizePositions(input.trades);
    if (recognized.issues.length || recognized.processes.length !== 1 || recognized.processes[0].status !== "closed") throw new Error("来源交易不是有效闭合过程，不能采用其现金指标。");
    const cash = calculateCash(recognized.processes[0], "none_confirmed");
    const values = { buy_amount: cash.buy_cents, sell_amount: cash.sell_cents, gross_pnl: cash.gross_pnl_cents, total_fees: cash.total_fee_cents, net_pnl: cash.net_pnl_cents };
    if (input.computed_metrics.length !== 5 || new Set(input.computed_metrics.map((m) => m.metric_id)).size !== 5) throw new Error("来源程序指标缺失或重复。");
    for (const metric of input.computed_metrics) {
      const value = values[metric.metric_id];
      const snapshot = input.evidence.find((e) => e.kind === "metric" && e.record_id === metric.metric_id);
      if (metric.value !== (value === null ? null : formatCents(value)) || metric.status !== (value === null ? "unknown" : "provisional") || canonical(metric.limitations) !== canonical(cash.limitations) || !snapshot || canonical(snapshot.values) !== canonical(metric)) throw new Error("来源程序金额、缺失状态或指标快照与录入交易计算不一致，拒绝导入。");
    }
    for (const trade of input.trades) {
      const snapshot = input.evidence.find((e) => e.kind === "trade" && e.record_id === trade.trade_id);
      const values = Object.fromEntries(Object.entries(trade).filter(([key]) => key !== "created_at" && key !== "updated_at"));
      if (!snapshot || canonical(snapshot.values) !== canonical(values)) throw new Error("来源交易与证据快照字段不一致。");
    }
    sources.push(source);
  }
  const checkTemplate = (t: Template) => {
    unique(t.items.map((i) => i.item_id), "条目");
    t.items.forEach((i) => {
      if (!i.origin) return; // Explicitly source-free user item: never invent a provenance.
      const s = sources.find((s) => s.report_id === i.origin!.report_id);
      const original = s && sourceReport(s).output.learning_items.find((l) => l.learning_id === i.origin!.learning_id);
      if (!original) throw new Error("条目声明了不存在的报告/学习来源；若确无来源请明确使用origin:null。");
      if (!i.user_edited && canonical({ question: i.question, why: i.why, required_evidence: i.required_evidence }) !== canonical({ question: original.question, why: original.why, required_evidence: original.required_evidence })) throw new Error("条目内容已不同于原报告，必须保留user_edited编辑状态。");
    });
  };
  parsed.checklists.forEach(checkTemplate);
  parsed.decisions.forEach((d) => {
    checkTemplate(d.checklist_snapshot);
    if (d.checklist_id !== d.checklist_snapshot.checklist_id || d.checklist_version !== d.checklist_snapshot.version) throw new Error("决策清单ID/版本与不可变快照不一致。");
    unique(d.answers.map((a) => a.item_id), "回答");
    const selected = d.checklist_snapshot.items.filter((i) => i.selected).map((i) => i.item_id);
    if (!selected.length || canonical([...selected].sort()) !== canonical(d.answers.map((a) => a.item_id).sort())) throw new Error("决策检查项与所选清单快照不匹配。");
    if (d.status === "completed") validateCompletion(d);
  });
  return { ...parsed, sources };
}
export async function prepareSave(board: Board, previous: Board, current: Ledger | null): Promise<Board> {
  const next = structuredClone(board), at = now();
  next.revision = previous.revision + 1; next.updated_at = at;
  next.checklists.forEach((t) => {
    const old = previous.checklists.find((c) => c.checklist_id === t.checklist_id);
    const content = (t: Template) => canonical({ name: t.name, scope: t.scope, items: t.items });
    if (old && content(old) !== content(t)) { t.version = old.version + 1; t.updated_at = at; }
    t.source_status_at_save = templateState(t, next, current);
  });
  next.decisions.forEach((d) => {
    const old = previous.decisions.find((x) => x.decision_id === d.decision_id);
    if (old && canonical(old.checklist_snapshot) !== canonical(d.checklist_snapshot)) throw new Error("已有决策的清单快照不可修改。");
    if (old?.status === "completed" && canonical(old) !== canonical(d)) {
      if (d.status !== "draft" || canonical({ ...d, status: "completed" }) !== canonical(old)) throw new Error("已完成记录需先退回草稿并保存，才能修改。");
    }
    if (!old || canonical(old) !== canonical(d)) d.updated_at = at;
  });
  return decodeBoard(JSON.stringify(next));
}
export function persistBoard(storage: Pick<Storage, "getItem" | "setItem">, board: Board, expected: string | null): string {
  const raw = JSON.stringify(board);
  if (new TextEncoder().encode(raw).byteLength > MAX_BYTES) throw new Error("清单备份超过8MiB容量上限，未保存；请导出备份。");
  if (storage.getItem(LEARNING_KEY) !== expected) throw new Error("另一标签页修改清单，本次未覆盖，请先导出草稿再刷新。");
  storage.setItem(LEARNING_KEY, raw);
  if (storage.getItem(LEARNING_KEY) !== raw) throw new Error("本地写入回读不一致，不能确认保存成功。");
  return raw;
}
export function startDecision(t: Template, board: Board, current: Ledger | null, allowUnconfirmed: boolean): Decision {
  const status = templateState(t, board, current);
  if (!t.items.some((i) => i.selected)) throw new Error("请先选择至少一个检查项并保存清单。");
  if (status !== "current" && !allowUnconfirmed) throw new Error("来源过期、缺失或当前无法核对，须明确确认沿用并保留限制。");
  const at = now();
  return { decision_id: `decision-${crypto.randomUUID()}`, checklist_id: t.checklist_id, checklist_version: t.version, checklist_snapshot: structuredClone(t), judgment: "", invalidation_condition: "", answers: t.items.filter((i) => i.selected).map((i) => ({ item_id: i.item_id, status: "unanswered", note: "", evidence_text: "" })), status: "draft", source_status_at_start: status, created_at: at, updated_at: at };
}
export async function exportBoard(board: Board, dirty: boolean) {
  const checked = await decodeBoard(JSON.stringify(board));
  const missing = [...checked.checklists, ...checked.decisions.map((d) => d.checklist_snapshot)].flatMap((t) => t.items.filter((i) => !i.origin).map((i) => `${t.checklist_id}/${i.item_id}：缺少报告来源，用户自建内容，无证据背书。`));
  const payload = { format: "investment-review-learning-backup-v1", exported_at: now(), persistence: dirty ? "unsaved_draft" : "saved", warnings: [...new Set(missing)], board: checked };
  let raw = JSON.stringify(payload, null, 2);
  if (new TextEncoder().encode(raw).byteLength > MAX_BYTES) raw = JSON.stringify(payload);
  if (new TextEncoder().encode(raw).byteLength > MAX_BYTES) throw new Error("导出超过8MiB上限；没有截断或丢弃来源。");
  return raw;
}
export async function importBoard(raw: string) {
  const envelope = z.strictObject({ format: z.literal("investment-review-learning-backup-v1"), exported_at: timestamp, persistence: z.enum(["saved", "unsaved_draft"]), warnings: z.array(z.string().max(600)).max(30000), board: z.unknown() }).parse(parseStrict(raw, MAX_BYTES));
  return decodeBoard(JSON.stringify(envelope.board));
}
export function relatedFindings(item: Item, board: Board): { source: Source; findings: ReviewFinding[] } | null {
  const s = item.origin && board.sources.find((s) => s.report_id === item.origin!.report_id);
  if (!s) return null;
  const o = sourceReport(s).output, learning = o.learning_items.find((l) => l.learning_id === item.origin!.learning_id)!;
  return { source: s, findings: [...o.fact_findings, ...o.explanation_hypotheses, ...o.behavior_hypotheses, ...o.uncertainties].filter((f) => learning.related_finding_ids.includes(f.finding_id)) };
}
