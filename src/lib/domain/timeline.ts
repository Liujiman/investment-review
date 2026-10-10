import type { Dataset, Event, MarketBar, Reason, Trade } from "./schema";

export type EvidenceRecord = Trade | Reason | Event | MarketBar;
export type EvidenceEntry = {
  id: string; kind: "trade" | "reason" | "event" | "market_bar"; title: string;
  date: string | null; at: string | null; precision: "datetime" | "date" | "unknown";
  time_basis: string; time_class: "pending"; record: EvidenceRecord;
};

// Group by recorded dates for display only. No inferred hour or prior/post classification.
export function unifiedEvidence(dataset: Dataset): EvidenceEntry[] {
  const entries: EvidenceEntry[] = [
    ...dataset.trades.map((record): EvidenceEntry => ({ id: record.evidence.evidence_id, kind: "trade",
      title: `${record.side === "BUY" ? "买入" : "卖出"} · ${record.symbol}`, date: record.trade_date, at: record.trade_at,
      precision: record.time_precision, time_basis: "成交日期 / 时刻", time_class: "pending", record })),
    ...dataset.reasons.map((record): EvidenceEntry => ({ id: record.evidence.evidence_id, kind: "reason",
      title: `${record.record_type === "recollection" ? "事后回忆" : "当时记录"} · ${record.symbol}`, date: record.formed_date, at: record.formed_at,
      precision: record.time_precision, time_basis: "理由形成日期 / 时刻", time_class: "pending", record })),
    ...dataset.events.map((record): EvidenceEntry => ({ id: record.evidence.evidence_id, kind: "event",
      title: record.title, date: record.published_date, at: record.published_at,
      precision: record.time_precision, time_basis: "首次公开日期 / 时刻", time_class: "pending", record })),
    ...dataset.market_bars.map((record): EvidenceEntry => ({ id: record.evidence.evidence_id, kind: "market_bar",
      title: `日线行情 · ${record.symbol}`, date: record.trade_date, at: null,
      precision: "date", time_basis: "日线日期标签（不是首次发布时间）", time_class: "pending", record })),
  ];
  return entries.sort((a, b) => (a.date ?? "9999-99-99").localeCompare(b.date ?? "9999-99-99"));
}
