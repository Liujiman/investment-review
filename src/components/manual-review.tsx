"use client";

import { useEffect, useRef, useState } from "react";
import type { Dataset } from "@/lib/domain/schema";
import { recognizePositions } from "@/lib/domain/positions";
import { canonical, pointer } from "@/lib/review/json";
import { accept, blankConfirmation, buildA, buildB, confirm, currentResult, entryFor, REVIEW_KEY, synchronize, task, type AInput, type BInput, type AOutput, type BOutput, type Entry, type Ledger, type ReviewFinding, type PriorFinding, type Snapshot } from "@/lib/review/engine";
import LearningWorkspace from "./learning-workspace";
import { decodeReview, saveReview } from "@/lib/review/store";
import { decodeDataset, STORAGE_KEY } from "@/lib/storage/dataset-store";

const button = "rounded-lg bg-teal-800 px-4 py-2 text-sm text-white disabled:bg-slate-300";
const field = "mt-2 w-full rounded border border-slate-300 bg-white p-2 text-sm";
function Finding({ finding, evidence }: { finding: ReviewFinding | PriorFinding; evidence: Snapshot[] }) {
  return <article className="mt-3 rounded border bg-slate-50 p-3 text-sm">
    <p className="whitespace-pre-wrap">{finding.statement}</p><p className="mt-2 text-amber-900">{finding.qualification}</p>
    {"alternative_explanations" in finding && finding.alternative_explanations.map((text, index) => <p key={index}>替代解释（待确认）：{text}</p>)}
    {finding.evidence_refs.map((ref, index) => {
      const snapshot = evidence.find((e) => e.evidence_id === ref.evidence_id)!;
      let value = "引用目标不可用"; try { value = String(pointer(snapshot.values, ref.field_path)); } catch {}
      return <details key={index} className="mt-2"><summary className="cursor-pointer text-teal-800">查看引用证据：{snapshot.kind} · {ref.usage}</summary>
        <p>证据ID：{snapshot.evidence_id} · 字段：{ref.field_path} · 程序原值：{value}</p>
        <p>来源：{snapshot.source_name} · {snapshot.source_locator}</p><p>是否构造：{snapshot.is_constructed ? "是" : "否"} · 时间分类：{snapshot.time_class} · {snapshot.availability_basis}</p>
        <p>首次可得：{snapshot.available_at ?? snapshot.available_date ?? "未知"} · 精度：{snapshot.time_precision} · 取数时间：{snapshot.fetched_at ?? "未取数"}</p>
        <p className="whitespace-pre-wrap">原摘录：{snapshot.source_excerpt || "未提供"}</p><p>{snapshot.limitations.join("；")}</p>
        <pre className="max-h-64 overflow-auto text-xs">{JSON.stringify(snapshot.values, null, 2)}</pre>
      </details>;
    })}
  </article>;
}

export default function ManualReview({ dataset, disabled }: { dataset: Dataset | null; disabled: boolean }) {
  const [ledger, setLedger] = useState<Ledger | null>(null), [boundContext, setBoundContext] = useState("");
  const [status, setStatus] = useState("尚未生成复盘报告"), [error, setError] = useState("");
  const [busy, setBusy] = useState(false), [selected, setSelected] = useState("");
  const [aText, setAText] = useState(""), [bText, setBText] = useState("");
  const expected = useRef<string | null>(null), generation = useRef(0), blocked = useRef(false), sourceExpected = useRef<string | null>(null);
  const actionToken = useRef(0);
  // Full context exists only locally. It is never appended to either task.
  const context = dataset ? canonical(dataset) : "";
  useEffect(() => {
    const token = ++generation.current;
    blocked.current = false;
    void (async () => {
      if (!dataset) { setLedger(null); setBoundContext(""); return; }
      try {
        const raw = localStorage.getItem(REVIEW_KEY); expected.current = raw;
        sourceExpected.current = localStorage.getItem(STORAGE_KEY);
        if (!sourceExpected.current || canonical(decodeDataset(sourceExpected.current)) !== context) throw new Error("原始交易/证据尚未成功保存，请先处理保存失败或下载备份；不能生成复盘任务。");
        const previous = raw ? await decodeReview(raw) : null;
        const next = await synchronize(previous, dataset);
        if (generation.current !== token) return;
        expected.current = saveReview(localStorage, next, raw);
        setLedger(next); setBoundContext(context); setAText(""); setBText(""); setError("");
        setStatus(previous && previous.dataset_fingerprint !== next.dataset_fingerprint ? "数据已修改：相关A/B已过期，完整性与归属须重新确认。旧报告保留原快照。" : "尚未生成复盘报告；已恢复本地辅助链路记录。");
      } catch (exception) {
        if (generation.current !== token) return;
        blocked.current = true; setBoundContext(""); setError(`复盘存储恢复/保存失败，未显示成功：${exception instanceof Error ? exception.message : "未知错误"}`);
      }
    })();
    const listener = (event: StorageEvent) => {
      if ((event.key === REVIEW_KEY || event.key === null) && event.newValue !== expected.current) { blocked.current = true; setBoundContext(""); setError("另一标签页已修改复盘，已暂停操作，请刷新。"); }
    };
    window.addEventListener("storage", listener);
    return () => { generation.current = token + 1; window.removeEventListener("storage", listener); };
    // Data changes immediately hide stale results via boundContext comparison.
  }, [context, dataset]);
  const ready = Boolean(dataset && ledger && context === boundContext && !disabled && !busy);
  const ordered = [...(dataset?.trades ?? [])].sort((a, b) => a.trade_date.localeCompare(b.trade_date) || (a.trade_at && b.trade_at ? Date.parse(a.trade_at) - Date.parse(b.trade_at) : (a.same_day_order ?? 0) - (b.same_day_order ?? 0)));
  const decision = ordered.find((t) => t.trade_id === selected) ?? ordered[0];
  const process = dataset && decision ? recognizePositions(dataset.trades).processes.find((p) => p.trades.some((t) => t.trade_id === decision.trade_id)) : null;
  const entry = ledger?.entries.find((e) => e.process_id === `${dataset?.case_id}:${process?.id}`);
  const confirmation = entry?.confirmation ?? blankConfirmation();
  const latest = (stage: (AInput | BInput)["stage"]) => ready ? entry?.packages.findLast((p) => p.stage === stage && p.episode_revision === entry.revision && p.decision_trade_id === decision?.trade_id) : undefined;
  const a = latest("prior_assessment") as AInput | undefined;
  const candidateB = latest("outcome_review") as BInput | undefined;
  const b = candidateB?.prior_package_id === a?.package_id ? candidateB : undefined;
  const aResult = a && entry ? currentResult(entry, a) as AOutput | undefined : undefined;
  const bResult = b && entry ? currentResult(entry, b) as BOutput | undefined : undefined;
  const evidenceOptions = dataset && decision ? [...dataset.events, ...dataset.market_bars].filter((e) => e.symbol === decision.symbol) : [];
  function commit(next: Ledger, message: string) {
    if (actionToken.current !== generation.current || localStorage.getItem(STORAGE_KEY) !== sourceExpected.current) throw new Error("原始交易/证据保存状态已改变，请刷新；未提交复盘。");
    expected.current = saveReview(localStorage, next, expected.current); setLedger(next); setStatus(message); setError("");
  }
  async function action(work: (next: Ledger, target: Entry) => Promise<void> | void) {
    if (!ready || blocked.current || !dataset || !ledger || !decision) return;
    const token = generation.current; setBusy(true); setError("");
    actionToken.current = token;
    try {
      const next = structuredClone(ledger), target = entryFor(next, dataset, decision.trade_id);
      await work(next, target);
      if (generation.current !== token) throw new Error("数据已改变，本次操作已失效。");
    } catch (exception) { setError(exception instanceof Error ? exception.message : "操作失败，未提交结果。"); }
    finally { setBusy(false); }
  }
  function changeConfirmation(change: Partial<typeof confirmation>) {
    void action((next, target) => { confirm(target, { ...target.confirmation, ...change }); commit(next, "确认条件已保存；变化使旧A/B失效。"); });
  }
  async function copy(input: AInput | BInput) {
    try { await navigator.clipboard.writeText(task(input)); setStatus(`${input.stage === "prior_assessment" ? "A" : "B"}完整任务已复制。请在外部模型粘贴；A使用独立干净上下文。`); }
    catch { setError("剪贴板不可用：请在完整任务预览中全选复制，或下载任务TXT；没有假报复制成功。"); }
  }
  function download(name: string, text: string) {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const stale = ready ? entry?.results.filter((r) => entry.packages.find((p) => p.package_id === r.package_id)?.episode_revision !== entry.revision) : [];
  return <>
    <section id="ai-review" aria-labelledby="ai-review-title" className="rounded-2xl border border-slate-200 bg-white p-6">
      <h2 id="ai-review-title" className="text-xl font-semibold">03 AI复盘 · 手动辅助A/B</h2>
      {!bResult && <h3 className="mt-3 font-semibold">尚未生成复盘报告</h3>}
      <p className="mt-3 text-sm">本页不调用模型。完整任务包含规则、该阶段完整输出Schema和允许输入；复制到外部工具将交出其中交易/理由，请先查看预览。构造与未核验标签保留，真实行情仍unavailable。</p>
      <p aria-live="polite" aria-label="复盘操作状态" className="mt-3 text-sm">{status}</p>
      {error && <p role="alert" aria-label="复盘校验错误" className="mt-3 rounded bg-red-50 p-3 text-sm text-red-900">{error}</p>}
      {!dataset && <p className="mt-3">先导入交易或载入固定构造案例，再确认完整性。</p>}
      {dataset && decision && <>
        <label className="mt-4 block text-sm">复盘决策交易<select className={field} value={decision.trade_id} disabled={!ready} onChange={(event) => { setSelected(event.target.value); setAText(""); setBText(""); setStatus("已切换决策；只能采用该交易绑定的A/B。"); }}>{ordered.map((trade) => <option key={trade.trade_id} value={trade.trade_id}>{trade.symbol} · {trade.trade_at ?? trade.trade_date} · {trade.side}</option>)}</select></label>
        <p className="mt-2 text-sm">{process?.status === "closed" ? "记录闭合；确认不是第三方核验，程序现金仍为暂算。" : "过程未清仓或识别失败，正式A/B任务不可生成。"}</p>
        <fieldset disabled={!ready} className="mt-3 space-y-2 text-sm">
          {([["opening_zero", "我确认首次买入前无该证券持仓"], ["complete", "我确认本段交易没有遗漏"], ["no_actions", "我确认本段没有影响股数或现金流的公司行动"], ["scope", "我确认所选事件和行情属于当前持仓过程；理由按关联交易归属"]] as const).map(([key, label]) => <label key={key} className="flex gap-2"><input type="checkbox" checked={confirmation[key]} onChange={(event) => changeConfirmation({ [key]: event.target.checked })} />{label}</label>)}
          <p>选择归属本过程的事件/行情（可不选，保留缺失状态；不会自动补充）：</p>
          {evidenceOptions.map((record) => <label key={record.evidence.evidence_id} className="flex gap-2"><input type="checkbox" checked={confirmation.evidence_ids.includes(record.evidence.evidence_id)} onChange={(event) => changeConfirmation({ evidence_ids: event.target.checked ? [...confirmation.evidence_ids, record.evidence.evidence_id] : confirmation.evidence_ids.filter((id) => id !== record.evidence.evidence_id) })} />{"title" in record ? record.title : `构造/用户日线 ${record.trade_date}`} · {record.evidence.source_type} · {record.evidence.quality.status}</label>)}
        </fieldset>
        <div className="mt-5 space-y-3">
          <h3 className="font-semibold">A · 事前决策评估</h3>
          <button className={button} disabled={!ready} onClick={() => void action(async (next, target) => { const input = await buildA(dataset, target, decision.trade_id); target.packages.push(input); commit(next, "A任务已生成并保存；尚未导入或冻结结果。"); setAText(""); setBText(""); })}>生成A任务</button>
          {a && <>
            <label className="block text-sm">完整A任务预览<textarea aria-label="完整A任务预览" className={`${field} font-mono`} rows={9} readOnly value={task(a)} /></label>
            <div className="flex flex-wrap gap-2"><button className={button} onClick={() => void copy(a)}>复制完整A任务</button><button className={button} onClick={() => download("review-A-task.txt", task(a))}>下载A任务TXT</button></div>
            <label className="block text-sm">粘贴A结果JSON<textarea className={`${field} font-mono`} rows={6} value={aText} onChange={(event) => setAText(event.target.value)} /></label>
            <button className={button} disabled={!ready || Boolean(aResult)} onClick={() => void action(async (next, target) => { const accepted = await accept(target, a, aText); next.entries = next.entries.map((e) => e.episode_id === accepted.episode_id ? accepted : e); commit(next, "A已通过结构、引用、时间及绑定校验并冻结保存；解释仍需人工核验。"); })}>校验并冻结A</button>
            {aResult && <div aria-label="冻结A结果" className="rounded border p-3 text-sm"><p>A已冻结：{aResult.decision_assessment.core_judgment}</p><p>来源：用户手动导入，非本页现场生成；构造/未核验限制不变。</p>{[...aResult.decision_assessment.evidence_support, ...aResult.decision_assessment.untested_assumptions, ...aResult.process_findings].map((finding) => <Finding key={finding.finding_id} finding={finding} evidence={a.evidence} />)}<p>{aResult.limitations.join("；")}</p></div>}
          </>}
          <h3 className="pt-3 font-semibold">B · 执行复盘与学习候选</h3>
          <button className={button} disabled={!ready || !a || !aResult} onClick={() => void action(async (next, target) => { const input = await buildB(dataset, target, a!); target.packages.push(input); commit(next, "B任务已生成并保存，绑定当前冻结A；尚未导入报告。"); setBText(""); })}>生成B任务</button>
          {b && <>
            <label className="block text-sm">完整B任务预览<textarea aria-label="完整B任务预览" className={`${field} font-mono`} rows={9} readOnly value={task(b)} /></label>
            <div className="flex flex-wrap gap-2"><button className={button} onClick={() => void copy(b)}>复制完整B任务</button><button className={button} onClick={() => download("review-B-task.txt", task(b))}>下载B任务TXT</button></div>
            <label className="block text-sm">粘贴B结果JSON<textarea className={`${field} font-mono`} rows={6} value={bText} onChange={(event) => setBText(event.target.value)} /></label>
            <button className={button} disabled={!ready} onClick={() => void action(async (next, target) => { const accepted = await accept(target, b, bText); next.entries = next.entries.map((e) => e.episode_id === accepted.episode_id ? accepted : e); commit(next, "B报告已通过结构、引用、时间及绑定校验并保存；清单仅为待确认候选。"); })}>校验B并形成报告候选</button>
            {bResult && <div aria-label="当前B复盘报告" className="mt-3 rounded border p-4 text-sm">
              <p className="font-medium">{dataset.data_mode === "constructed" ? "构造演示报告" : "用户记录复盘（未独立核验）"} · 人工核验状态：待核验</p>
              <p>AI 内容已通过结构、引用和时间校验；解释与行为偏差仍需人工核验。</p><p className="mt-2 whitespace-pre-wrap">{bResult.summary}</p>
              <h4 className="mt-3 font-semibold">程序现金指标（CSV/录入交易，非行情接口）</h4>
              {b.computed_metrics.map((metric) => <p key={metric.metric_id}>{metric.metric_id}：{metric.value ?? "未知"}{metric.value !== null ? " 元" : ""} · {metric.status} · {metric.formula}</p>)}
              <p className="text-amber-900">{b.data_quality.join("；")}</p>
              {(["fact_findings", "explanation_hypotheses", "behavior_hypotheses", "uncertainties"] as const).map((key) => <div key={key}><h4 className="mt-3 font-semibold">{({ fact_findings: "事实记录", explanation_hypotheses: "解释假设（待核验）", behavior_hypotheses: "行为假设（待核验）", uncertainties: "缺口与不确定性" })[key]}</h4>{bResult[key].length ? bResult[key].map((finding) => <Finding key={finding.finding_id} finding={finding} evidence={b.evidence} />) : <p>无有效条目，不补造。</p>}</div>)}
              <button className={`${button} mt-3`} onClick={() => download("review-report-with-snapshots.json", JSON.stringify({ package: b, output: bResult, source: "manual_import", verification: "待核验" }, null, 2))}>下载当前报告与快照</button>
            </div>}
          </>}
        </div>
        {!!stale?.length && <details className="mt-4 text-sm"><summary>查看过期报告（仅历史快照）</summary>{stale.map((r) => <div key={r.package_id} className="mt-3 border p-3"><p>已过期，不能用于当前B或清单 · {r.package_id}</p><pre className="max-h-64 overflow-auto text-xs">{JSON.stringify(r.output, null, 2)}</pre><button className={button} onClick={() => download("stale-review-snapshot.json", JSON.stringify({ expired: true, output: r.output, package: entry?.packages.find((p) => p.package_id === r.package_id) }, null, 2))}>下载旧报告原快照</button></div>)}</details>}
      </>}
    </section>
    <LearningWorkspace report={b && bResult && entry && ledger ? { ledger, entry, input: b } : null} current={context === boundContext ? ledger : null} />

  </>;
}
