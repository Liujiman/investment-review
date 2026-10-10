import type { Dataset } from "@/lib/domain/schema";
import { unifiedEvidence } from "@/lib/domain/timeline";
import EvidenceDetails from "./evidence-details";

const kindLabels = { trade: "交易", reason: "理由", event: "事件", market_bar: "行情" };
export default function EvidenceTimeline({ dataset }: { dataset: Dataset | null }) {
  const entries = dataset ? unifiedEvidence(dataset) : [];
  const dates = [...new Set(entries.map((entry) => entry.date))];
  return <section id="timeline" aria-labelledby="timeline-title" className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-7">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="timeline-title" className="text-xl font-semibold">02 时间线与统一证据</h2><span className="rounded bg-amber-50 px-3 py-1 text-sm text-amber-900">时间分类：待计算</span></div>
    <p className="mt-3 text-sm leading-6 text-slate-600">交易、理由、事件与日线按记录日期汇总。同日排列仅为展示顺序，不证明先后或当时已知；时间分类、行情图与完整性判断尚未实现。</p>
    {!entries.length && <p className="mt-5 text-sm text-slate-500">尚无证据。请在导入区载入示例或导入交易，不会自动生成行情、事件或理由。</p>}
    {!!entries.length && <>
      <p className="mt-4 text-sm">共 {entries.length} 条记录：交易 {dataset!.trades.length} · 理由 {dataset!.reasons.length} · 事件 {dataset!.events.length} · 行情 {dataset!.market_bars.length}。</p>
      <p className="mt-2 rounded bg-amber-50 p-3 text-sm text-amber-900">{dataset!.data_mode === "constructed" ? "synthetic 构造数据，仅用于演示，不对应真实股票或公司新闻。" : "用户提供的记录，真实性与历史版本未自动核验。"}</p>
      {dates.map((date) => <div key={date ?? "unknown"} className="mt-6 border-l-2 border-slate-200 pl-4 sm:pl-6">
        <h3 className="font-semibold">{date ?? "未提供记录日期"}</h3>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">{entries.filter((entry) => entry.date === date).map((entry) => <article key={entry.id} aria-label={`${kindLabels[entry.kind]}：${entry.title}`} className="min-w-0 rounded-xl bg-slate-50 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2"><h4 className="font-medium">{entry.title}</h4><span className="text-xs text-amber-900">时间分类：待计算</span></div>
          <p className="mt-2 text-xs text-slate-500">{kindLabels[entry.kind]} · {entry.record.evidence.source_type} · {entry.id}</p>
          <p className="mt-2 text-sm">{entry.time_basis}：{entry.at ?? (entry.date ? `${entry.date}（仅日期，没有小时）` : "未知，未提供")}</p>
          {entry.kind === "trade" && "quantity" in entry.record && <p className="mt-2 text-sm">{entry.record.quantity} 股 · 成交价 {entry.record.price} 元/股 · 费用 {entry.record.fee ?? "未知"}{entry.record.fee !== null ? " 元" : "（未补零）"}</p>}
          {entry.kind === "reason" && "judgment" in entry.record && <p className="mt-2 whitespace-pre-wrap text-sm">{entry.record.judgment}</p>}
          {entry.kind === "event" && "excerpt" in entry.record && <p className="mt-2 whitespace-pre-wrap text-sm">{entry.record.excerpt}</p>}
          {entry.kind === "market_bar" && "close" in entry.record && <p className="mt-2 text-sm">开 {entry.record.open} / 高 {entry.record.high} / 低 {entry.record.low} / 收 {entry.record.close} 元/股；成交量 {entry.record.volume} 股，成交额 {entry.record.turnover} 元。<br />首次可得：{entry.record.evidence.first_available.at ?? entry.record.evidence.first_available.date ?? "未知"}。</p>}
          <EvidenceDetails record={entry.record} />
        </article>)}</div>
      </div>)}
      {!!dataset!.market_bars.length && dataset!.data_mode === "constructed" && <p className="mt-4 text-xs text-slate-500">固定案例2025-03-02为周日，其日线纯属构造素材，不能当作真实A股交易日。</p>}
    </>}
  </section>;
}
