import type { Dataset, Trade } from "./schema";
import { unifiedEvidence, type EvidenceEntry } from "./timeline";

export type TimeClass = "prior" | "post" | "unknown";
export const timeLabels: Record<TimeClass, string> = { prior: "事前可知", post: "事后信息", unknown: "时间未知" };
export type Classification = { time_class: TimeClass; explanation: string };
export type ClassifiedEntry = Omit<EvidenceEntry, "time_class"> & Classification;
export function decisionCutoff(trade: Trade) {
  return { at: trade.trade_at ?? `${trade.trade_date}T00:00:00+08:00`,
    basis: trade.trade_at ? "实际成交时刻之前，严格小于边界" : "仅日期交易：保守采用上海当日00:00边界，不是实际成交时刻" };
}
function compareTime(date: string | null, at: string | null, precision: string, cutoff: number): Classification {
  if (precision === "unknown" || !date) return { time_class: "unknown", explanation: "首次可得时间未知，不用取数时间替代。" };
  if (precision === "datetime" && at) return Date.parse(at) < cutoff ?
    { time_class: "prior", explanation: "已记录的首次可得时刻严格早于决策边界。" } :
    { time_class: "post", explanation: "首次可得时刻晚于或等于决策边界；相等不算事前。" };
  const start = Date.parse(`${date}T00:00:00+08:00`), end = start + 86_400_000 - 1;
  if (end < cutoff) return { time_class: "prior", explanation: "仅日期信息的整日区间结束于边界之前。" };
  if (start >= cutoff) return { time_class: "post", explanation: "仅日期信息的整日区间起点晚于或等于边界。" };
  return { time_class: "unknown", explanation: "仅日期信息的整日区间跨越决策边界，不能假定在成交前公开。" };
}
export function classifyEvidence(dataset: Dataset, decisionTradeId: string): ClassifiedEntry[] {
  const decision = dataset.trades.find((trade) => trade.trade_id === decisionTradeId);
  if (!decision) throw new Error("选定决策交易不存在。");
  const cutoff = Date.parse(decisionCutoff(decision).at);
  return unifiedEvidence(dataset).filter((entry) => entry.record.symbol === decision.symbol && entry.record.data_mode === decision.data_mode).map((entry) => {
    const record = entry.record;
    let result: Classification;
    if (("has_time_conflict" in record && record.has_time_conflict) || record.evidence.quality.status === "conflict") {
      result = { time_class: "unknown", explanation: "记录存在时间或来源冲突，排除事前证据。" };
    } else if ("historical_version_confirmed" in record && !record.historical_version_confirmed) {
      result = { time_class: "unknown", explanation: "无法核实摘录对应的历史文本版本；当前修改后的旧报道不凭初次发布时间成为事前内容。" };
    } else if ("trade_id" in record && entry.kind === "trade" && record.trade_id === decisionTradeId) {
      result = { time_class: "post", explanation: "当前交易最终成交价、数量和费用属于执行结果，不是该交易事前已知事实。" };
    } else {
      const available = record.evidence.first_available;
      result = compareTime(available.date, available.at, available.precision, cutoff);
      if (entry.kind === "trade" && "trade_at" in record) {
        const execution = compareTime(record.trade_date, record.trade_at, record.time_precision, cutoff);
        if (execution.time_class !== "prior") result = { ...execution, explanation: `成交事实：${execution.explanation}` };
      }
      if (entry.kind === "reason" && "record_type" in record) {
        if (record.record_type === "recollection" && result.time_class === "prior") result = { time_class: "unknown", explanation: "事后回忆不能作为已证明的当时判断，即使填入更早形成时间。" };
        const associated = dataset.trades.find((trade) => trade.trade_id === record.trade_id)!;
        if (associated.trade_id !== decisionTradeId && compareTime(associated.trade_date, associated.trade_at, associated.time_precision, cutoff).time_class !== "prior" && result.time_class === "prior") {
          result = { time_class: "unknown", explanation: "理由关联的交易未证明发生在边界前，不能作为当前决策的事前理由。" };
        }
      }
      if (entry.kind === "market_bar" && "close" in record) {
        if (record.trade_date >= decision.trade_date && result.time_class === "prior") result = { time_class: "post", explanation: "第一版不将同日或未来完整日线作为事前行情；不能还原盘中状态。" };
        result.explanation += record.evidence.source_type === "synthetic" ? " 完整日线仅在决策日期之前才可能进入事前；此条为构造行情。" : " 当前获取的历史行情，不证明当时数据版本；取数时间不等于首次可得时间。";
      }
    }
    return { ...entry, ...result };
  });
}
