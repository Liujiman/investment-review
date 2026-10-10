import { z } from "zod";

export const dateSchema = z.iso.date();
export const datetimeSchema = z.iso.datetime({ offset: true });
const id = z.string().min(1).max(160);
const text = z.string().max(2000);
const decimalPattern = /^(?:0|[1-9]\d{0,14})(?:\.\d{1,6})?$/;
const decimal = z.string().regex(decimalPattern, "应为非负十进制数，最多6位小数，不含单位或指数");
export const decimalUnits = (value: string) => {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0"));
};
const positiveDecimal = decimal.refine((value) => decimalPattern.test(value) && decimalUnits(value) > 0n, "必须大于零");
const symbol = z.string().regex(/^(?:DEMO001|\d{6}\.(?:SH|SZ|BJ))$/);
export const modeSchema = z.enum(["real", "constructed"]);
const precision = z.enum(["datetime", "date", "unknown"]);
export function shanghaiDay(at: string) {
  if (!Number.isFinite(Date.parse(at))) return "";
  return new Date(Date.parse(at) + 8 * 3600_000).toISOString().slice(0, 10);
}

export const availabilitySchema = z.strictObject({
  date: dateSchema.nullable(), at: datetimeSchema.nullable(), precision,
  basis: text.min(1),
}).superRefine((value, ctx) => {
  const valid = value.precision === "datetime" ? value.at !== null && value.date !== null && shanghaiDay(value.at) === value.date :
    value.precision === "date" ? value.date !== null && value.at === null : value.date === null && value.at === null;
  if (!valid) ctx.addIssue({ code: "custom", message: "时间精度与日期/时刻不一致；仅日期不能补造时刻" });
});

export const evidenceSchema = z.strictObject({
  evidence_id: id,
  source_type: z.enum(["synthetic", "user_provided", "provider_api"]),
  source_name: text.min(1), source_reference: text.min(1),
  source_fields: z.record(z.string().min(1), z.string().min(1)),
  units: z.record(z.string().min(1), z.string().min(1)),
  timezone: z.literal("Asia/Shanghai"),
  first_available: availabilitySchema,
  fetched_at: datetimeSchema.nullable(),
  quality: z.strictObject({ status: z.enum(["synthetic", "unverified", "verified", "missing", "conflict"]), notes: z.array(text).max(20) }),
}).superRefine((value, ctx) => {
  if ((value.source_type === "synthetic") !== (value.quality.status === "synthetic")) {
    ctx.addIssue({ code: "custom", message: "synthetic 来源和质量标记必须一致" });
  }
});

const common = {
  evidence: evidenceSchema, data_mode: modeSchema,
  created_at: datetimeSchema, updated_at: datetimeSchema,
};
function modeMatches(value: { symbol: string; data_mode: "real" | "constructed"; evidence: z.infer<typeof evidenceSchema> }, ctx: z.RefinementCtx) {
  if ((value.data_mode === "constructed") !== (value.symbol === "DEMO001") ||
      (value.data_mode === "constructed") !== (value.evidence.source_type === "synthetic")) {
    ctx.addIssue({ code: "custom", path: ["data_mode"], message: "构造数据只允许 DEMO001 和 synthetic 来源，不能与真实模式混用" });
  }
}

export const tradeSchema = z.strictObject({
  ...common, trade_id: id, batch_id: id, source_row: z.number().int().min(2),
  symbol, name: z.string().max(100), trade_date: dateSchema, trade_at: datetimeSchema.nullable(),
  time_precision: z.enum(["datetime", "date"]), side: z.enum(["BUY", "SELL"]),
  quantity: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), price: positiveDecimal,
  fee: decimal.nullable(), same_day_order: z.number().int().positive().nullable(), order_confirmed: z.boolean(),
}).superRefine((value, ctx) => {
  modeMatches(value, ctx);
  if (value.time_precision === "date" ? value.trade_at !== null : value.trade_at === null || shanghaiDay(value.trade_at) !== value.trade_date) {
    ctx.addIssue({ code: "custom", path: ["trade_at"], message: "成交时间与日期/精度不一致" });
  }
});

export const reasonSchema = z.strictObject({
  ...common, reason_id: id, episode_id: id.nullable(), trade_id: id, symbol,
  record_type: z.enum(["contemporaneous", "recollection"]), judgment: text.min(1),
  expected_evidence: text, invalidation_condition: text, source_excerpt: text,
  source_url: z.url({ protocol: /^https?$/ }).nullable(),
  formed_date: dateSchema.nullable(), formed_at: datetimeSchema.nullable(), time_precision: precision,
  historical_version_confirmed: z.boolean(), has_time_conflict: z.boolean(),
}).superRefine((value, ctx) => {
  modeMatches(value, ctx);
  if (!availabilitySchema.safeParse({ date: value.formed_date, at: value.formed_at, precision: value.time_precision, basis: "形成时间" }).success) {
    ctx.addIssue({ code: "custom", path: ["formed_at"], message: "理由形成时间与精度不一致" });
  }
  if (value.formed_date !== value.evidence.first_available.date || value.formed_at !== value.evidence.first_available.at) {
    ctx.addIssue({ code: "custom", path: ["evidence"], message: "理由首次可得时间必须保留其形成时间，回忆不能反推为当时记录" });
  }
});

export const eventSchema = z.strictObject({
  ...common, event_id: id, episode_id: id.nullable(), symbol, title: text.min(1), excerpt: text,
  source_url: z.url({ protocol: /^https?$/ }).nullable(), occurred_date: dateSchema.nullable(),
  published_date: dateSchema.nullable(), published_at: datetimeSchema.nullable(), time_precision: precision,
  historical_version_confirmed: z.boolean(), has_time_conflict: z.boolean(),
}).superRefine((value, ctx) => {
  modeMatches(value, ctx);
  if (!availabilitySchema.safeParse({ date: value.published_date, at: value.published_at, precision: value.time_precision, basis: "公开时间" }).success ||
      value.published_date !== value.evidence.first_available.date || value.published_at !== value.evidence.first_available.at) {
    ctx.addIssue({ code: "custom", path: ["published_at"], message: "事件首次可得时间必须使用公开时间，不可使用发生时间或取数时间替代" });
  }
});

export const marketBarSchema = z.strictObject({
  ...common, bar_id: id, market_snapshot_id: id, symbol, trade_date: dateSchema,
  open: positiveDecimal, high: positiveDecimal, low: positiveDecimal, close: positiveDecimal,
  volume: decimal, turnover: decimal, currency: z.literal("CNY"), adjust: z.literal("none"),
  upstream_data_timestamp: datetimeSchema.nullable(),
}).superRefine((value, ctx) => {
  modeMatches(value, ctx);
  if (![value.open, value.high, value.low, value.close].every((price) => decimal.safeParse(price).success)) return;
  const low = decimalUnits(value.low), high = decimalUnits(value.high);
  if (low > high || [value.open, value.close].some((price) => decimalUnits(price) < low || decimalUnits(price) > high)) {
    ctx.addIssue({ code: "custom", path: ["high"], message: "OHLC 关系不成立" });
  }
  if (value.evidence.source_type === "provider_api" && value.evidence.first_available.precision !== "unknown") {
    ctx.addIssue({ code: "custom", path: ["evidence"], message: "供应商日线未提供可靠首次公开时间，不能将日线日期/上游时间戳捏造为首次可得时间" });
  }
});

export const importBatchSchema = z.strictObject({
  batch_id: id, filename: z.string().max(255), imported_at: datetimeSchema, data_mode: modeSchema,
  adopted_rows: z.array(z.number().int().min(2)), excluded_rows: z.array(z.number().int().min(2)),
  ignored_blank_rows: z.number().int().nonnegative(),
  duplicate_decisions: z.array(z.strictObject({ group: id, excluded_rows: z.array(z.number().int().min(2)) })),
  order_confirmations: z.array(z.string()),
});
export const datasetSchema = z.strictObject({
  schema_version: z.literal("1.0"), dataset_version: z.literal("fields-import-v1"),
  case_id: id, label: text, data_mode: modeSchema, created_at: datetimeSchema, updated_at: datetimeSchema,
  trades: z.array(tradeSchema).max(5000), reasons: z.array(reasonSchema).max(1000),
  events: z.array(eventSchema).max(1000), market_bars: z.array(marketBarSchema).max(5000),
  import_batches: z.array(importBatchSchema).max(100), active_reason_id: id.nullable(),
}).superRefine((value, ctx) => {
  const records = [...value.trades, ...value.reasons, ...value.events, ...value.market_bars];
  const evidenceIds = records.map((record) => record.evidence.evidence_id);
  if (new Set(evidenceIds).size !== evidenceIds.length) ctx.addIssue({ code: "custom", message: "证据 ID 重复" });
  for (const [name, ids] of [
    ["trades", value.trades.map((record) => record.trade_id)], ["reasons", value.reasons.map((record) => record.reason_id)],
    ["events", value.events.map((record) => record.event_id)], ["market_bars", value.market_bars.map((record) => record.bar_id)],
    ["import_batches", value.import_batches.map((batch) => batch.batch_id)],
  ] as const) {
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", path: [name], message: "业务 ID 重复" });
  }
  if (records.some((record) => record.data_mode !== value.data_mode) || value.import_batches.some((batch) => batch.data_mode !== value.data_mode)) {
    ctx.addIssue({ code: "custom", message: "真实与构造数据不可混合" });
  }
  if (value.reasons.some((reason) => !value.trades.some((trade) => trade.trade_id === reason.trade_id && trade.symbol === reason.symbol))) {
    ctx.addIssue({ code: "custom", path: ["reasons"], message: "理由必须关联同股票的有效交易" });
  }
  if (value.trades.some((trade) => !value.import_batches.some((batch) => batch.batch_id === trade.batch_id))) {
    ctx.addIssue({ code: "custom", path: ["import_batches"], message: "交易来源批次不存在" });
  }
  if (value.active_reason_id !== null && !value.reasons.some((reason) => reason.reason_id === value.active_reason_id)) {
    ctx.addIssue({ code: "custom", path: ["active_reason_id"], message: "选中的理由不存在" });
  }
  const barKeys = value.market_bars.map((bar) => `${bar.market_snapshot_id}:${bar.symbol}:${bar.trade_date}`);
  if (new Set(barKeys).size !== barKeys.length) ctx.addIssue({ code: "custom", path: ["market_bars"], message: "同一行情快照存在重复日期" });
});

export type Trade = z.infer<typeof tradeSchema>;
export type Reason = z.infer<typeof reasonSchema>;
export type Event = z.infer<typeof eventSchema>;
export type MarketBar = z.infer<typeof marketBarSchema>;
export type Evidence = z.infer<typeof evidenceSchema>;
export type Dataset = z.infer<typeof datasetSchema>;
export type DataMode = z.infer<typeof modeSchema>;
