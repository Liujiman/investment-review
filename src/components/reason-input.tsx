"use client";

import { useState, type FormEvent } from "react";
import { ZodError } from "zod";
import type { Dataset } from "@/lib/domain/schema";
import { appendReason, type ReasonInput as ReasonFields } from "@/lib/domain/reasons";
import EvidenceDetails from "./evidence-details";

const field = "mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm disabled:bg-slate-100";
export default function ReasonInput({ dataset, disabled, onSave }: {
  dataset: Dataset; disabled: boolean; onSave: (next: Dataset) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<ReasonFields>({
    trade_id: dataset.trades[0]?.trade_id ?? "", record_type: "recollection", judgment: "", expected_evidence: "",
    invalidation_condition: "", source_excerpt: "", source_name: "", source_url: "", time_precision: "unknown",
    formed_date: "", formed_time: "", historical_version_confirmed: false,
  });
  const [error, setError] = useState("");
  const activeReason = dataset.reasons.find((reason) => reason.reason_id === dataset.active_reason_id);
  const update = <K extends keyof ReasonFields>(key: K, value: ReasonFields[K]) => setDraft((previous) => ({ ...previous, [key]: value }));
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    if (disabled) return;
    try {
      const next = appendReason(dataset, draft);
      if (await onSave(next)) setDraft((previous) => ({ ...previous, judgment: "", expected_evidence: "", invalidation_condition: "", source_excerpt: "", source_name: "", source_url: "", formed_date: "", formed_time: "", time_precision: "unknown", historical_version_confirmed: false }));
    } catch (exception) {
      setError(exception instanceof ZodError ? exception.issues.map((issue) => `${issue.path.join(".")}：${issue.message}`).join("；") : exception instanceof Error ? exception.message : "理由校验失败，当前记录没有改变。");
    }
  }

  return <div className="mt-6 border-t border-slate-200 pt-5">
    <h3 className="font-semibold">理由输入与原始记录</h3>
    <p className="mt-2 text-sm leading-6 text-slate-600">为已有交易补充理由。原始记录与事后回忆分别保存；未知时间留空，不补造历史依据。新增记录会保留原有理由。</p>
    <form aria-label="新增交易理由" className="mt-4 space-y-4" onSubmit={submit}>
      <fieldset disabled={disabled} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">关联交易<select className={field} value={draft.trade_id} onChange={(event) => update("trade_id", event.target.value)} required>
            {dataset.trades.map((trade) => <option key={trade.trade_id} value={trade.trade_id}>{trade.symbol} · {trade.trade_at ?? trade.trade_date} · {trade.side === "BUY" ? "买入" : "卖出"}</option>)}
          </select></label>
          <label className="block text-sm">记录类型<select className={field} value={draft.record_type} onChange={(event) => update("record_type", event.target.value as ReasonFields["record_type"])}>
            <option value="recollection">事后回忆（不能证明当时已知）</option><option value="contemporaneous">当时记录（需核对原文及时间）</option>
          </select></label>
        </div>
        <label className="block text-sm">核心判断（必填）<textarea className={field} rows={3} maxLength={2000} required value={draft.judgment} onChange={(event) => update("judgment", event.target.value)} /></label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">预期证据<textarea className={field} rows={2} maxLength={2000} value={draft.expected_evidence} onChange={(event) => update("expected_evidence", event.target.value)} /></label>
          <label className="block text-sm">失效条件<textarea className={field} rows={2} maxLength={2000} value={draft.invalidation_condition} onChange={(event) => update("invalidation_condition", event.target.value)} /></label>
        </div>
        <label className="block text-sm">原始摘录<textarea className={field} rows={3} maxLength={2000} value={draft.source_excerpt} onChange={(event) => update("source_excerpt", event.target.value)} /></label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">来源名称（必填）<input className={field} maxLength={2000} required value={draft.source_name} onChange={(event) => update("source_name", event.target.value)} /></label>
          <label className="block text-sm">原文链接（可选，仅 http / https）<input className={field} type="url" value={draft.source_url} onChange={(event) => update("source_url", event.target.value)} /></label>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block text-sm">理由形成时间精度<select className={field} value={draft.time_precision} onChange={(event) => update("time_precision", event.target.value as ReasonFields["time_precision"])}>
            <option value="unknown">未知，不补造</option><option value="date">仅日期</option><option value="datetime">日期与时刻（上海时区）</option>
          </select></label>
          {draft.time_precision !== "unknown" && <label className="block text-sm">原理由形成日期<input className={field} type="date" required value={draft.formed_date} onChange={(event) => update("formed_date", event.target.value)} /></label>}
          {draft.time_precision === "datetime" && <label className="block text-sm">原理由形成时刻（上海）<input className={field} type="time" step="1" required value={draft.formed_time} onChange={(event) => update("formed_time", event.target.value)} /></label>}
        </div>
        <label className="flex gap-2 text-sm"><input type="checkbox" checked={draft.historical_version_confirmed} onChange={(event) => update("historical_version_confirmed", event.target.checked)} />我已核对摘录对应的原始历史版本（用户确认，不是自动认证）</label>
        <p className="text-xs leading-5 text-slate-500">形成时间来自你填写的原记录；当前录入时间仅用于管理。事后回忆不能改作已证明的当时记录。时间线按选定决策分类，历史版本与来源冲突未独立核验。</p>
        <button type="submit" className="rounded-lg bg-teal-800 px-4 py-2 text-sm font-medium text-white disabled:bg-slate-200 disabled:text-slate-500">保存新增理由</button>
      </fieldset>
      {error && <p role="alert" className="whitespace-pre-wrap rounded-lg bg-red-50 p-3 text-sm text-red-900">{error}</p>}
    </form>
    {!dataset.reasons.length ? <p className="mt-4 text-sm text-slate-500">尚未填写理由，不会自动补写。</p> : <div className="mt-5">
      <label htmlFor="reason-version" className="block text-sm">选择理由版本（原始记录均保留）</label>
      <select id="reason-version" value={dataset.active_reason_id ?? ""} disabled={disabled} className="mt-2 max-w-full rounded-lg border border-slate-300 p-2 text-sm" onChange={(event) => void onSave({ ...dataset, active_reason_id: event.target.value, updated_at: new Date().toISOString() })}>
        {dataset.reasons.map((reason) => <option key={reason.reason_id} value={reason.reason_id}>{reason.record_type === "contemporaneous" ? "当时记录" : "事后回忆（不能证明当时已知）"} · {reason.formed_at ?? reason.formed_date ?? "时间未知"} · {reason.judgment.slice(0, 24)}</option>)}
      </select>
      {activeReason && <article className="mt-3 min-w-0 rounded-lg bg-slate-50 p-4 text-sm leading-6 [overflow-wrap:anywhere]">
        <p className="font-medium">{activeReason.record_type === "recollection" ? "事后回忆" : "当时记录"} · {activeReason.evidence.source_type}</p>
        <p>形成时间：{activeReason.formed_at ?? activeReason.formed_date ?? "未知，未提供"}</p>
        <p className="whitespace-pre-wrap">判断：{activeReason.judgment}</p><p className="whitespace-pre-wrap">预期证据：{activeReason.expected_evidence || "未填写"}</p><p className="whitespace-pre-wrap">失效条件：{activeReason.invalidation_condition || "未填写"}</p>
        <EvidenceDetails record={activeReason} />
      </article>}
    </div>}
  </div>;
}
