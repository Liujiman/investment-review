import { datasetSchema, reasonSchema, type Dataset } from "./schema";

export type ReasonInput = {
  trade_id: string; record_type: "contemporaneous" | "recollection";
  judgment: string; expected_evidence: string; invalidation_condition: string;
  source_excerpt: string; source_name: string; source_url: string;
  time_precision: "unknown" | "date" | "datetime"; formed_date: string; formed_time: string;
  historical_version_confirmed: boolean;
};

export function appendReason(dataset: Dataset, input: ReasonInput, now = new Date().toISOString(), id: string = crypto.randomUUID()): Dataset {
  const trade = dataset.trades.find((item) => item.trade_id === input.trade_id);
  if (!trade) throw new Error("请选择已有交易，不能为不存在的交易保存理由。");
  const formedDate = input.time_precision === "unknown" ? null : input.formed_date;
  const formedAt = input.time_precision === "datetime" ? `${input.formed_date}T${input.formed_time.length === 5 ? `${input.formed_time}:00` : input.formed_time}+08:00` : null;
  const synthetic = dataset.data_mode === "constructed";
  const reason = reasonSchema.parse({
    reason_id: id, episode_id: null, trade_id: trade.trade_id, symbol: trade.symbol,
    data_mode: dataset.data_mode, created_at: now, updated_at: now,
    record_type: input.record_type, judgment: input.judgment.trim(), expected_evidence: input.expected_evidence.trim(),
    invalidation_condition: input.invalidation_condition.trim(), source_excerpt: input.source_excerpt,
    source_url: input.source_url.trim() || null, formed_date: formedDate, formed_at: formedAt, time_precision: input.time_precision,
    historical_version_confirmed: input.historical_version_confirmed, has_time_conflict: false,
    evidence: {
      evidence_id: `evidence-${id}`, source_type: synthetic ? "synthetic" : "user_provided",
      source_name: input.source_name.trim(), source_reference: `local-reason:${id}`,
      source_fields: { judgment: "/judgment", expected_evidence: "/expected_evidence", invalidation_condition: "/invalidation_condition", source_excerpt: "/source_excerpt", formed_date: "/formed_date", formed_at: "/formed_at" },
      units: { judgment: "文本", expected_evidence: "文本", invalidation_condition: "文本", source_excerpt: "文本", formed_date: "上海自然日", formed_at: "ISO8601" },
      timezone: "Asia/Shanghai", fetched_at: null,
      first_available: { date: formedDate, at: formedAt, precision: input.time_precision,
        basis: input.record_type === "recollection" ? "用户填写的事后回忆形成时间；不能证明当时已知" : "用户填写的原理由形成时间；未自动核验历史原文或首次公开时间" },
      quality: { status: synthetic ? "synthetic" : "unverified", notes: [
        synthetic ? "用户为构造案例补充的 synthetic 理由，不对应真实投资事实" : "用户录入，未自动核验真实性与历史版本",
        "时间分类与冲突检测待计算；管理时间不是历史形成时间",
        ...(input.time_precision === "unknown" ? ["未提供原理由形成时间，不补造日期或时刻"] : []),
        ...(input.record_type === "recollection" ? ["事后回忆不能改作已证明的当时依据"] : []),
      ] },
    },
  });
  return datasetSchema.parse({ ...dataset, updated_at: now, reasons: [...dataset.reasons, reason], active_reason_id: reason.reason_id });
}
