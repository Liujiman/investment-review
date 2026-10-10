"use client";

import { useState } from "react";
import type { Dataset } from "@/lib/domain/schema";
import { classifyEvidence, decisionCutoff, timeLabels, type TimeClass } from "@/lib/domain/visibility";
import EvidenceDetails from "./evidence-details";
import PositionSummary from "./position-summary";
import type { CorporateActionStatus } from "@/lib/domain/positions";

const kindLabels = { trade: "交易", reason: "理由", event: "事件", market_bar: "行情" };
export default function EvidenceTimeline({ dataset }: { dataset: Dataset | null }) {
  const [selected, setSelected] = useState("");
  const [filter, setFilter] = useState<"all" | TimeClass>("all");
  const [actionState, setActionState] = useState<{ revision: string; values: Record<string, CorporateActionStatus> }>({ revision: "", values: {} });
  const actions = actionState.revision === dataset?.updated_at ? actionState.values : {};
  const ordered = [...(dataset?.trades ?? [])].sort((a, b) => a.trade_date.localeCompare(b.trade_date) ||
    (a.trade_at && b.trade_at ? Date.parse(a.trade_at) - Date.parse(b.trade_at) : (a.same_day_order ?? 0) - (b.same_day_order ?? 0)));
  const decision = ordered.find((trade) => trade.trade_id === selected) ?? ordered.find((trade) => trade.side === "BUY") ?? ordered[0];
  const classified = dataset && decision ? classifyEvidence(dataset, decision.trade_id) : [];
  const entries = classified.filter((entry) => filter === "all" || entry.time_class === filter);
  const dates = [...new Set(entries.map((entry) => entry.date))];
  return <section id="timeline" aria-labelledby="timeline-title" className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-7">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="timeline-title" className="text-xl font-semibold">02 时间线与统一证据</h2><span className="rounded bg-teal-50 px-3 py-1 text-sm text-teal-900">程序分类与计算 · 不使用模型</span></div>
    <p className="mt-3 text-sm leading-6 text-slate-600">按选定交易的决策边界分类，仅使用首次可得时间，不用取数时间替代。事前可知表示时间上可能获得，不证明用户实际看过；同日展示顺序不证明时间先后。</p>
    {!dataset && <p className="mt-5 text-sm text-slate-500">尚无证据。请在导入区载入示例或导入交易，不会自动生成行情、事件或理由。</p>}
    {dataset && decision && <>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-sm">选中决策交易<select className="mt-1 block w-full rounded border p-2" value={decision.trade_id} onChange={(event) => setSelected(event.target.value)}>{ordered.map((trade) => <option key={trade.trade_id} value={trade.trade_id}>{trade.symbol} · {trade.trade_at ?? `${trade.trade_date}（仅日期）`} · {trade.side === "BUY" ? "买入" : "卖出"} · 行{trade.source_row}</option>)}</select></label>
        <label className="text-sm">证据可见范围<select className="mt-1 block w-full rounded border p-2" value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}><option value="all">全部记录（含事后，不是事前评估）</option>{Object.entries(timeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      </div>
      <p className="mt-3 text-sm">决策边界（上海）：{decisionCutoff(decision).at}；{decisionCutoff(decision).basis}。</p>
      <p className="mt-2 text-sm" aria-label="证据分类数量">本证券共 {classified.length} 条 · 事前可知 {classified.filter((entry) => entry.time_class === "prior").length} · 事后信息 {classified.filter((entry) => entry.time_class === "post").length} · 时间未知 {classified.filter((entry) => entry.time_class === "unknown").length}；当前显示 {entries.length} 条。</p>
      {filter === "all" && <PositionSummary dataset={dataset} actions={actions} onAction={(id, value) => setActionState({ revision: dataset.updated_at, values: { ...actions, [id]: value } })} />}
      {!entries.length && <p className="mt-5 text-sm">当前分类没有记录，不补造证据。</p>}
      <p className="mt-2 rounded bg-amber-50 p-3 text-sm text-amber-900">{dataset!.data_mode === "constructed" ? "构造数据，仅用于演示，不对应真实股票或公司新闻；来源类型按各条记录保留，用户上传未经验证。" : "用户提供的记录，真实性与历史版本未自动核验。"}</p>
      {dates.map((date) => <div key={date ?? "unknown"} className="mt-6 border-l-2 border-slate-200 pl-4 sm:pl-6">
        <h3 className="font-semibold">{date ?? "未提供记录日期"}</h3>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">{entries.filter((entry) => entry.date === date).map((entry) => <article key={entry.id} aria-label={`${kindLabels[entry.kind]}：${entry.title}`} className="min-w-0 rounded-xl bg-slate-50 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2"><h4 className="font-medium">{entry.title}</h4><span className="text-xs text-teal-900">时间分类：{timeLabels[entry.time_class]}</span></div>
          <p className="mt-2 text-xs leading-5 text-slate-600">{entry.explanation}</p>
          <p className="mt-2 text-xs text-slate-500">{kindLabels[entry.kind]} · {entry.record.evidence.source_type} · {entry.id}</p>
          <p className="mt-2 text-sm">{entry.time_basis}：{entry.at ?? (entry.date ? `${entry.date}（仅日期，没有小时）` : "未知，未提供")}</p>
          {entry.kind === "trade" && "quantity" in entry.record && <p className="mt-2 text-sm">{entry.record.quantity} 股 · 成交价 {entry.record.price} 元/股 · 费用 {entry.record.fee ?? "未知"}{entry.record.fee !== null ? " 元" : "（未补零）"}</p>}
          {entry.kind === "reason" && "judgment" in entry.record && <p className="mt-2 whitespace-pre-wrap text-sm">{entry.record.judgment}</p>}
          {entry.kind === "event" && "excerpt" in entry.record && <p className="mt-2 whitespace-pre-wrap text-sm">{entry.record.excerpt}</p>}
          {entry.kind === "market_bar" && "close" in entry.record && <p className="mt-2 text-sm">开 {entry.record.open} / 高 {entry.record.high} / 低 {entry.record.low} / 收 {entry.record.close} 元/股；成交量 {entry.record.volume} 股，成交额 {entry.record.turnover} 元。<br />首次可得：{entry.record.evidence.first_available.at ?? entry.record.evidence.first_available.date ?? "未知"}。</p>}
          <EvidenceDetails record={entry.record} classification={entry} />
        </article>)}</div>
      </div>)}
      {!!dataset!.market_bars.length && dataset!.data_mode === "constructed" && <p className="mt-4 text-xs text-slate-500">固定案例2025-03-02为周日，其日线纯属构造素材，不能当作真实A股交易日。</p>}
    </>}
  </section>;
}
