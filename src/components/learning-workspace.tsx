"use client";

import { useEffect, useRef, useState } from "react";
import { canonical } from "@/lib/review/json";
import type { BInput, Entry, Ledger } from "@/lib/review/engine";
import { decodeBoard, emptyBoard, exportBoard, importBoard, LEARNING_KEY, makeSource, MAX_BYTES, newTemplate, now, persistBoard, prepareSave, relatedFindings, sourceReport, sourceState, startDecision, templateState, validateCompletion, type Board, type Decision, type Item, type Template } from "@/lib/learning/board";

const button = "rounded-lg bg-teal-800 px-4 py-2 text-sm text-white disabled:bg-slate-300";
const field = "mt-2 w-full rounded border border-slate-300 bg-white p-2 text-sm";
const labels = { current: "当前来源（仍未独立核验）", expired: "来源已过期", unconfirmed: "来源缺失或当前无法核对" };
type CurrentReport = { ledger: Ledger; entry: Entry; input: BInput };
function download(raw: string) {
  const url = URL.createObjectURL(new Blob([raw], { type: "application/json;charset=utf-8" }));
  const a = document.createElement("a"); a.href = url; a.download = "learning-board-backup.json"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function storageError(error: unknown) {
  if (error instanceof DOMException && error.name === "QuotaExceededError") return "浏览器容量不足，未保存；保留页面草稿，请导出备份。";
  if (error instanceof DOMException && error.name === "SecurityError") return "浏览器本地存储不可用，未保存；保留页面草稿，请导出备份。";
  return error instanceof Error ? error.message : "操作失败，未保存。";
}
function Provenance({ item, board, current }: { item: Item; board: Board; current: Ledger | null }) {
  const related = relatedFindings(item, board);
  if (!related) return <p className="text-amber-900">缺少报告来源：用户自建条目，没有证据背书；导出保留origin:null，不补造来源。</p>;
  const { input, output } = sourceReport(related.source);
  const refs = related.findings.flatMap((f) => f.evidence_refs);
  const metricIds = related.findings.flatMap((f) => f.metric_ids);
  const evidence = input.evidence.filter((e) => refs.some((r) => r.evidence_id === e.evidence_id) || input.computed_metrics.some((m) => metricIds.includes(m.metric_id) && e.evidence_id.endsWith(`:metric-${m.metric_id}`)));
  return <details className="mt-2 text-xs"><summary className="cursor-pointer text-teal-800">查看清单来源与证据快照</summary>
    <p>报告ID：{related.source.report_id} · 包ID：{output.package_id}</p>
    <p>过程ID：{input.episode_id} · 版本：{input.episode_revision} · 决策ID：{input.decision_trade_id}</p>
    <p>学习ID：{item.origin!.learning_id} · 状态：{labels[sourceState(related.source, current)]}</p>
    <p>原学习问题：{output.learning_items.find((l) => l.learning_id === item.origin!.learning_id)!.question}</p>
    <p>关联结论ID：{related.findings.map((f) => f.finding_id).join("、")}</p>
    {related.findings.map((f) => <p key={f.finding_id}>{f.statement} · {f.qualification}</p>)}
    {!evidence.length && <p className="text-amber-900">关联结论无证据引用，属于缺口或待核验问题；不是已证明事实。</p>}
    {evidence.map((e) => <div key={e.evidence_id} className="mt-2 rounded border p-2"><p>证据ID：{e.evidence_id} · 原记录ID：{e.record_id} · 版本：原包修订{input.episode_revision}</p><p>来源：{e.source_name} · {e.source_locator} · 构造：{e.is_constructed ? "是" : "否"} · 时间分类：{e.time_class}</p><p>限制：{e.limitations.join("；")}</p><p>引用路径：{refs.filter((r) => r.evidence_id === e.evidence_id).map((r) => `${r.field_path} (${r.usage})`).join("、")}</p><pre className="max-h-60 overflow-auto whitespace-pre-wrap">{JSON.stringify(e.values, null, 2)}</pre></div>)}
    <p>完整原A/B输入、冻结输出和证据快照包含在导出备份中；保存清单不表示解释成立或资料已verified。</p>
  </details>;
}

export default function LearningWorkspace({ report, current }: { report: CurrentReport | null; current: Ledger | null }) {
  const [board, setBoard] = useState<Board | null>(null), [saved, setSaved] = useState<Board | null>(null);
  const [chosen, setChosen] = useState(""), [decisionId, setDecisionId] = useState("");
  const [busy, setBusy] = useState(false), [blocked, setBlocked] = useState(false);
  const [error, setError] = useState(""), [status, setStatus] = useState("正在读取本地清单。");
  const [importText, setImportText] = useState(""), [preview, setPreview] = useState<Board | null>(null);
  const [allowOld, setAllowOld] = useState(false);
  const expected = useRef<string | null>(null), generation = useRef(0);
  useEffect(() => {
    const token = ++generation.current;
    void (async () => {
      try {
        const raw = localStorage.getItem(LEARNING_KEY), next = raw ? await decodeBoard(raw) : emptyBoard();
        if (generation.current !== token) return;
        expected.current = raw; setBoard(next); setSaved(next); setBlocked(false); setStatus(raw ? "已恢复本地清单及决策记录。" : "尚无已保存清单；不会自动采用模型候选。");
      } catch (e) {
        if (generation.current !== token) return;
        setBoard(emptyBoard()); setSaved(null); setBlocked(true); setError(`恢复失败，未覆盖原数据：${storageError(e)}`); setStatus("本地数据未恢复；可整理内存草稿并导出，修复前不能覆盖保存。");
      }
    })();
    const listener = (event: StorageEvent) => {
      if ((event.key === LEARNING_KEY || event.key === null) && event.newValue !== expected.current) { setBlocked(true); setError("另一标签页修改清单，已暂停保存；请导出草稿再刷新。"); }
    };
    window.addEventListener("storage", listener);
    return () => { generation.current = token + 1; window.removeEventListener("storage", listener); };
  }, []);
  const dirty = Boolean(board && (!saved || canonical(board) !== canonical(saved)));
  const t = board?.checklists.find((c) => c.checklist_id === chosen) ?? board?.checklists[0];
  const d = board?.decisions.find((d) => d.decision_id === decisionId) ?? board?.decisions.at(-1);
  async function attempt(work: () => Promise<void> | void) {
    if (busy) return; setBusy(true); setError("");
    try { await work(); } catch (e) { setError(storageError(e)); }
    finally { setBusy(false); }
  }
  async function save(next: Board, message: string) {
    if (blocked || !saved) throw new Error("本地数据未安全恢复或发生冲突，未保存；请导出草稿后修复/刷新。");
    const checked = await prepareSave(next, saved, current);
    const raw = persistBoard(localStorage, checked, expected.current);
    expected.current = raw; setBoard(checked); setSaved(checked); setStatus(message); setAllowOld(false);
  }
  function editTemplate(change: (template: Template) => void) {
    if (!board || !t) return;
    const next = structuredClone(board), target = next.checklists.find((c) => c.checklist_id === t.checklist_id)!;
    change(target); setBoard(next); setAllowOld(false); setStatus("清单有未保存修改；点击保存后才进入浏览器本地存储。");
  }
  function editItem(id: string, change: Partial<Item>, edited = false) { editTemplate((t) => { const item = t.items.find((i) => i.item_id === id)!; Object.assign(item, change); if (edited) item.user_edited = true; }); }
  function editDecision(change: (decision: Decision) => void) {
    if (!board || !d || d.status === "completed") return;
    const next = structuredClone(board); change(next.decisions.find((x) => x.decision_id === d.decision_id)!); setBoard(next); setStatus("决策记录有未保存修改。");
  }
  return <section id="checklist" aria-labelledby="checklist-title" className="rounded-2xl border border-slate-200 bg-white p-6">
    <h2 id="checklist-title" className="text-xl font-semibold">04 学习清单与下一次决策</h2>
    <p className="mt-3 text-sm">候选须用户选择、编辑并明确保存。仅当前浏览器本地存储，没有云同步；清除站点数据会丢失记录。清单不会提供买卖建议，勾选不表示可以交易。</p>
    <p aria-label="清单保存状态" aria-live="polite" className="mt-2 text-sm">{status} {dirty ? "有未保存草稿。" : ""}</p>
    {error && <p role="alert" aria-label="清单操作错误" className="mt-2 rounded bg-red-50 p-3 text-sm text-red-900">{error}</p>}
    <div className="mt-3 flex flex-wrap gap-2">
      <button className={button} disabled={busy || !board || !report} onClick={() => void attempt(async () => {
        const source = await makeSource(report!.ledger, report!.entry, report!.input), next = structuredClone(board!);
        const existing = next.checklists.find((c) => c.items.some((i) => i.origin?.report_id === source.report_id));
        if (existing) { setChosen(existing.checklist_id); setStatus("已选择该报告的现有候选，不重复新增。"); return; }
        if (!next.sources.some((s) => s.report_id === source.report_id)) next.sources.push(source);
        const created = newTemplate(source); next.checklists.push(created); setBoard(next); setChosen(created.checklist_id); setStatus("已选择当前报告候选，尚未保存；逐条选择采用并检查适用范围。");
      })}>选择当前报告候选</button>
      <button className={button} disabled={busy || !board} onClick={() => {
        const next = structuredClone(board!), at = now();
        const created: Template = { checklist_id: `checklist-${crypto.randomUUID()}`, name: "用户自建清单", version: 1, scope: { kind: "general", symbol: null, description: "用户自定义适用范围（缺少报告来源）" }, items: [], source_status_at_save: "unconfirmed", created_at: at, updated_at: at };
        next.checklists.push(created); setBoard(next); setChosen(created.checklist_id); setStatus("已新建内存草稿，没有报告来源；请添加检查项并保存。");
      }}>新建无报告来源清单</button>
      <button className={button} disabled={busy || !board} onClick={() => void attempt(async () => { download(await exportBoard(board!, dirty)); setStatus(dirty ? "已导出未保存草稿及来源；不代表本地保存成功。" : "已导出清单、决策及可追溯来源备份。"); })}>导出清单与决策备份</button>
    </div>
    {!t && <h3 className="mt-3 font-semibold">尚未生成清单</h3>}
    {board && t && <fieldset disabled={busy} className="mt-4 space-y-3 text-sm">
      <label className="block">选择清单<select className={field} value={t.checklist_id} onChange={(e) => { setChosen(e.target.value); setAllowOld(false); }}>{board.checklists.map((c) => <option key={c.checklist_id} value={c.checklist_id}>{c.name} · v{c.version}</option>)}</select></label>
      <p>清单ID：{t.checklist_id} · 版本：{t.version} · {labels[templateState(t, board, current)]}</p>
      <label className="block">清单名称<input className={field} value={t.name} onChange={(e) => editTemplate((t) => { t.name = e.target.value; })} /></label>
      <label className="block">适用范围<select className={field} value={t.scope.kind} onChange={(e) => editTemplate((t) => { t.scope.kind = e.target.value as Template["scope"]["kind"]; })}><option value="process">来源持仓过程</option><option value="symbol">指定证券</option><option value="general">一般记录检查</option></select></label>
      <label className="block">适用证券（可空）<input className={field} value={t.scope.symbol ?? ""} onChange={(e) => editTemplate((t) => { t.scope.symbol = e.target.value.trim() || null; })} /></label>
      <label className="block">适用范围说明<textarea aria-label="适用范围说明" className={field} value={t.scope.description} onChange={(e) => editTemplate((t) => { t.scope.description = e.target.value; })} /></label>
      {t.items.map((item, index) => <article key={item.item_id} aria-label={`清单条目${index + 1}`} className="rounded border p-3">
        <p>条目ID：{item.item_id} · 用户编辑状态：{item.user_edited ? "已编辑" : "未编辑"}</p>
        <div className="mt-2 flex flex-wrap gap-4"><label><input type="checkbox" checked={item.selected} onChange={(e) => editItem(item.item_id, { selected: e.target.checked })} />采用检查项：{index + 1}</label><label><input type="checkbox" checked={item.checked} onChange={(e) => editItem(item.item_id, { checked: e.target.checked })} />已人工检查：{index + 1}</label></div>
        <label className="mt-2 block">候选学习问题<textarea aria-label="候选学习问题" className={field} value={item.question} onChange={(e) => editItem(item.item_id, { question: e.target.value }, true)} /></label>
        <label className="block">学习依据<textarea aria-label="学习依据" className={field} value={item.why} onChange={(e) => editItem(item.item_id, { why: e.target.value }, true)} /></label>
        <label className="block">待核验材料（每行一项）<textarea aria-label="待核验材料（每行一项）" className={field} value={item.required_evidence.join("\n")} onChange={(e) => editItem(item.item_id, { required_evidence: e.target.value.split("\n").filter((s) => s.trim()) }, true)} /></label>
        <Provenance item={item} board={board} current={current} />
        <div className="mt-3 flex gap-2"><button className={button} disabled={index === 0} onClick={() => editTemplate((t) => { [t.items[index - 1], t.items[index]] = [t.items[index], t.items[index - 1]]; })}>上移条目</button><button className={button} onClick={() => { if (window.confirm("删除此草稿条目？不会改变原报告或已有决策快照。")) editTemplate((t) => { t.items = t.items.filter((i) => i.item_id !== item.item_id); }); }}>删除条目</button></div>
      </article>)}
      <button className={button} onClick={() => editTemplate((t) => { t.items.push({ item_id: `item-${crypto.randomUUID()}`, question: "待填写的用户检查问题", why: "", required_evidence: [], selected: false, checked: false, user_edited: true, origin: null }); })}>添加无来源检查项</button>
      <div className="flex flex-wrap gap-2"><button className={button} disabled={blocked} onClick={() => void attempt(() => save(board, "清单已确认并保存到当前浏览器；不代表模型解释或来源已核验。"))}>确认保存清单</button><button className={button} disabled={blocked} onClick={() => void attempt(async () => { if (!window.confirm("删除该清单模板？已有决策保留原清单和来源快照。其他草稿修改也将保存。")) return; const next = structuredClone(board); next.checklists = next.checklists.filter((c) => c.checklist_id !== t.checklist_id); await save(next, "模板已删除并保存；已有决策快照未改变。"); setChosen(""); })}>删除清单模板</button></div>
      {templateState(t, board, current) !== "current" && <label className="block text-amber-900"><input type="checkbox" checked={allowOld} onChange={(e) => setAllowOld(e.target.checked)} />我确认沿用过期或当前无法核对的来源（含缺来源条目），保留限制</label>}
      <button className={button} disabled={blocked} onClick={() => void attempt(async () => { if (dirty) throw new Error("请先保存清单及其他草稿，确保下一记录绑定已保存版本。"); const next = structuredClone(board), created = startDecision(t, next, current, allowOld); next.decisions.push(created); await save(next, "下一次决策草稿已创建并保存；只记录理由、反证条件和检查项，不建议买卖。"); setDecisionId(created.decision_id); })}>开始下一次决策记录</button>
    </fieldset>}
    {board && d && <fieldset disabled={busy} aria-label="下一次决策记录" className="mt-6 space-y-3 rounded border p-4 text-sm">
      <h3 className="font-semibold">下一次决策记录（不提供买卖建议）</h3>
      <label className="block">选择决策记录<select className={field} value={d.decision_id} onChange={(e) => setDecisionId(e.target.value)}>{board.decisions.map((d) => <option key={d.decision_id} value={d.decision_id}>{d.decision_id} · {d.status}</option>)}</select></label>
      <p>记录ID：{d.decision_id} · 状态：{d.status} · 清单版本：{d.checklist_version} · 创建时来源：{labels[d.source_status_at_start]}</p>
      <p>适用范围快照：{d.checklist_snapshot.scope.description} · {d.checklist_snapshot.scope.symbol ?? "未指定证券"}</p>
      {!board.checklists.some((t) => t.checklist_id === d.checklist_id) && <p className="text-amber-900">来源模板已删除；继续显示原清单快照。</p>}
      <p>{labels[templateState(d.checklist_snapshot, board, current)]}；模板修改不会回写此记录。</p>
      <label className="block">决策理由<textarea aria-label="决策理由" className={field} disabled={d.status === "completed"} value={d.judgment} onChange={(e) => editDecision((d) => { d.judgment = e.target.value; })} /></label>
      <label className="block">反证条件<textarea aria-label="反证条件" className={field} disabled={d.status === "completed"} value={d.invalidation_condition} onChange={(e) => editDecision((d) => { d.invalidation_condition = e.target.value; })} /></label>
      {d.answers.map((answer, index) => { const item = d.checklist_snapshot.items.find((i) => i.item_id === answer.item_id)!; return <article key={answer.item_id} className="rounded border p-3"><p>检查项：{item.question} · 来源编辑状态：{item.user_edited ? "用户已编辑" : "原候选"}</p>
        <label className="block">检查状态：{index + 1}<select aria-label={`检查状态：${index + 1}`} className={field} disabled={d.status === "completed"} value={answer.status} onChange={(e) => editDecision((d) => { d.answers[index].status = e.target.value as typeof answer.status; })}><option value="unanswered">未检查</option><option value="met">满足</option><option value="not_met">未满足</option><option value="not_applicable">不适用</option></select></label>
        <label className="block">检查说明：{index + 1}<textarea aria-label={`检查说明：${index + 1}`} className={field} disabled={d.status === "completed"} value={answer.note} onChange={(e) => editDecision((d) => { d.answers[index].note = e.target.value; })} /></label>
        <label className="block">用户证据文本或链接：{index + 1}<textarea aria-label={`用户证据文本或链接：${index + 1}`} className={field} disabled={d.status === "completed"} value={answer.evidence_text} onChange={(e) => editDecision((d) => { d.answers[index].evidence_text = e.target.value; })} /></label><Provenance item={item} board={board} current={current} /></article>; })}
      <div className="flex flex-wrap gap-2">{d.status === "draft" ? <><button className={button} disabled={blocked} onClick={() => void attempt(() => save(board, "决策草稿已保存到当前浏览器。"))}>保存决策草稿</button><button className={button} disabled={blocked} onClick={() => void attempt(async () => { const next = structuredClone(board), target = next.decisions.find((x) => x.decision_id === d.decision_id)!; validateCompletion(target); target.status = "completed"; await save(next, "决策记录已完成并保存；检查状态不构成买卖建议。"); })}>完成并保存决策记录</button></> : <button className={button} disabled={blocked} onClick={() => void attempt(async () => { const next = structuredClone(board); next.decisions.find((x) => x.decision_id === d.decision_id)!.status = "draft"; await save(next, "已退回草稿并保存，可继续编辑理由和检查项。"); })}>退回草稿并保存</button>}</div>
    </fieldset>}
    <details className="mt-5 text-sm"><summary className="cursor-pointer">导入清单与决策备份</summary>
      <p className="mt-2">仅支持本页面导出的版本。验证来源包哈希、报告引用和清单快照；导入不使来源自动有效或verified。先导出现有内容，确认后整体替换清单与决策；不会替换原始交易、证据或A/B存储。</p>
      <label className="mt-3 block">上传清单JSON备份<input className={field} type="file" accept=".json,application/json" disabled={busy} onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (!file) return; setPreview(null); void attempt(async () => { if (file.size > MAX_BYTES) throw new Error("文件超过8MiB，不读取或截断。"); const raw = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer()); setImportText(raw); setPreview(null); setStatus("文件已读取，尚未校验或导入。"); }); }} /></label>
      <label className="block">粘贴清单JSON备份<textarea aria-label="粘贴清单JSON备份" className={`${field} font-mono`} rows={5} value={importText} onChange={(e) => { setImportText(e.target.value); setPreview(null); }} /></label>
      <button className={`${button} mt-3`} disabled={busy} onClick={() => void attempt(async () => { setPreview(null); const next = await importBoard(importText); setPreview(next); setStatus("备份校验通过，尚未替换或保存。"); })}>校验清单备份</button>
      {preview && <div className="mt-3"><p>待导入：{preview.checklists.length}份清单、{preview.decisions.length}份决策、{preview.sources.length}份报告来源。缺来源条目：{[...preview.checklists, ...preview.decisions.map((d) => d.checklist_snapshot)].flatMap((t) => t.items).filter((i) => !i.origin).length}。来源须结合当前数据重新核对。</p><button className={`${button} mt-2`} disabled={busy || blocked} onClick={() => void attempt(async () => { if (!window.confirm("确认整体替换当前清单与决策？请先导出现有备份。原交易和A/B报告不被修改。")) return; if (!saved) throw new Error("本地存储尚未恢复，不能导入覆盖。"); const next = await decodeBoard(JSON.stringify(preview)); next.revision = saved.revision + 1; next.updated_at = now(); next.checklists.forEach((t) => { t.source_status_at_save = templateState(t, next, current); }); const raw = persistBoard(localStorage, next, expected.current); expected.current = raw; setBoard(next); setSaved(next); setChosen(""); setDecisionId(""); setPreview(null); setAllowOld(false); setStatus("备份已导入并保存；来源限制和未核验标签保留，没有云同步。"); })}>确认替换并保存备份</button></div>}
    </details>
  </section>;
}
