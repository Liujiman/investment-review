"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import { ZodError } from "zod";
import type { Dataset } from "@/lib/domain/schema";
import { appendEvent, decodeEvidenceText, type EventInput as EventFields } from "@/lib/domain/events";

const field = "mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm";
export default function EventInput({ dataset, disabled, onSave }: { dataset: Dataset; disabled: boolean; onSave: (next: Dataset) => Promise<boolean> }) {
  const [draft, setDraft] = useState<EventFields>({ symbol: dataset.trades[0]?.symbol ?? "", title: "", excerpt: "", source_name: "", source_url: "",
    published_date: "", published_time: "", time_precision: "unknown", historical_version_confirmed: false, filename: null });
  const [error, setError] = useState("");
  const [reading, setReading] = useState(false);
  const update = <K extends keyof EventFields>(key: K, value: EventFields[K]) => setDraft((previous) => ({ ...previous, [key]: value }));
  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file || disabled || reading) return;
    setReading(true); setError("");
    try {
      const bytes = file.size > 64 * 1024 ? new Uint8Array(64 * 1024 + 1) : new Uint8Array(await file.arrayBuffer());
      const excerpt = decodeEvidenceText(bytes, file.name);
      setDraft((previous) => ({ ...previous, excerpt, filename: file.name }));
    } catch (exception) { setError(exception instanceof Error ? exception.message : "读取失败，原摘录保持不变。"); }
    finally { setReading(false); }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); if (disabled || reading) return;
    try {
      if (await onSave(appendEvent(dataset, draft))) setDraft((previous) => ({ ...previous, title: "", excerpt: "", source_name: "", source_url: "", published_date: "", published_time: "", time_precision: "unknown", historical_version_confirmed: false, filename: null }));
    } catch (exception) { setError(exception instanceof ZodError ? exception.issues.map((issue) => `${issue.path.join(".")}：${issue.message}`).join("；") : exception instanceof Error ? exception.message : "保存失败。"); }
  }
  return <div className="mt-6 border-t pt-5">
    <h3 className="font-semibold">用户上传事件证据</h3>
    <p className="mt-2 text-sm leading-6 text-slate-600">上传你有权使用的原文摘录，或手动粘贴；只保存在当前浏览器，不访问链接、不发送到模型。UTF-8 .txt 最大64KiB，摘录最多2000字符，不自动截断。PDF、图片、行情快照上传尚未实现。</p>
    <p className="mt-2 text-sm text-amber-900">{dataset.data_mode === "constructed" ? "当前为构造演示：新增资料保留 user_provided / unverified 和明确构造标记，不对应真实公司或公告。填写真实资料前，请先导入用户交易CSV。" : "当前为用户交易：上传资料标记user_provided / unverified，不标为provider_api，不证明来源或许可已核验。"}</p>
    <form aria-label="新增事件证据" onSubmit={submit} className="mt-4 space-y-4">
      <fieldset disabled={disabled || reading} className="space-y-4">
        <label className="block text-sm">上传证据原文（TXT）<input type="file" accept=".txt,text/plain" onChange={upload} className="mt-1 block max-w-full" /></label>
        {draft.filename && <p className="text-xs">已读取：{draft.filename}；请确认摘录与历史版本后保存。</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm">证据关联证券<select className={field} value={draft.symbol} onChange={(event) => update("symbol", event.target.value)}>{[...new Set(dataset.trades.map((trade) => trade.symbol))].map((symbol) => <option key={symbol}>{symbol}</option>)}</select></label>
          <label className="text-sm">事件标题（必填）<input className={field} required maxLength={2000} value={draft.title} onChange={(event) => update("title", event.target.value)} /></label>
        </div>
        <label className="block text-sm">事件原始摘录（必填）<textarea className={field} rows={4} required maxLength={2000} value={draft.excerpt} onChange={(event) => update("excerpt", event.target.value)} /></label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm">证据来源名称（必填）<input className={field} required maxLength={2000} value={draft.source_name} onChange={(event) => update("source_name", event.target.value)} /></label>
          <label className="text-sm">证据原文链接（可选）<input className={field} type="url" value={draft.source_url} onChange={(event) => update("source_url", event.target.value)} /></label>
          <label className="text-sm">首次发布时间精度<select className={field} value={draft.time_precision} onChange={(event) => update("time_precision", event.target.value as EventFields["time_precision"])}><option value="unknown">未知</option><option value="date">仅日期</option><option value="datetime">日期与时刻</option></select></label>
          {draft.time_precision !== "unknown" && <label className="text-sm">原始首次公开日期<input className={field} type="date" required value={draft.published_date} onChange={(event) => update("published_date", event.target.value)} /></label>}
          {draft.time_precision === "datetime" && <label className="text-sm">原始首次公开时刻（上海）<input className={field} type="time" step="1" required value={draft.published_time} onChange={(event) => update("published_time", event.target.value)} /></label>}
        </div>
        <label className="flex gap-2 text-sm"><input type="checkbox" checked={draft.historical_version_confirmed} onChange={(event) => update("historical_version_confirmed", event.target.checked)} />我确认摘录对应当时版本；当前修订后的文字不能仅凭旧发布日期成为事前依据。</label>
        <button type="submit" className="rounded-lg bg-teal-800 px-4 py-2 text-sm text-white disabled:bg-slate-300">保存新增事件证据</button>
      </fieldset>
      {reading && <p className="text-sm">正在读取本地原文…</p>}
      {error && <p role="alert" aria-label="事件证据校验错误" className="rounded bg-red-50 p-3 text-sm text-red-900">{error}</p>}
    </form>
  </div>;
}
