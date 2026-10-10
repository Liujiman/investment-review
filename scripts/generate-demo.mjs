import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// Fixed, invented teaching fixture. No provider calls, randomness or real news.
const output = fileURLToPath(new URL("../public/samples/", import.meta.url));
const recorded = "2026-10-10T00:00:00+08:00";
const batchId = "demo001-batch-v1";
const common = { data_mode: "constructed", created_at: recorded, updated_at: recorded };
function evidence(id, fields, units, date, at, basis) {
  return {
    evidence_id: `evidence-${id}`, source_type: "synthetic", source_name: "固定构造案例 DEMO001",
    source_reference: `public/samples/demo-case.json#${id}`,
    source_fields: Object.fromEntries(fields.map((field) => [field, `/${field}`])), units,
    timezone: "Asia/Shanghai", first_available: { date, at, precision: at ? "datetime" : date ? "date" : "unknown", basis },
    fetched_at: recorded, quality: { status: "synthetic", notes: ["完全构造，不对应真实公司、行情或新闻；取数时间表示本地案例制作时间。"] },
  };
}
const trades = [
  { trade_id: "demo001-buy", trade_date: "2025-03-03", trade_at: "2025-03-03T10:00:00+08:00", side: "BUY", price: "10", source_row: 2 },
  { trade_id: "demo001-sell", trade_date: "2025-03-10", trade_at: "2025-03-10T14:00:00+08:00", side: "SELL", price: "9", source_row: 3 },
].map((trade) => ({ ...common, ...trade, batch_id: batchId, symbol: "DEMO001", name: "构造示例公司",
  time_precision: "datetime", quantity: 100, fee: "5", same_day_order: 1, order_confirmed: true,
  evidence: evidence(trade.trade_id, ["trade_date", "trade_at", "side", "quantity", "price", "fee"],
    { quantity: "股", price: "元/股", fee: "元" }, trade.trade_date, trade.trade_at, "构造成交记录的成交时间，不代表买入之前已知道成交结果"),
}));
const reasons = [
  { reason_id: "demo001-reason-contemporaneous", record_type: "contemporaneous", formed_date: "2025-03-03", formed_at: "2025-03-03T09:30:00+08:00",
    judgment: "构造日记：希望检验此前公开的流程改进说明是否得到后续材料支持。", expected_evidence: "后续定期记录中可核查的进度材料。",
    invalidation_condition: "关键进度与原假设不一致时，应重新记录判断依据。", source_excerpt: "构造当时记录：尚无法确认流程改进能否持续。" },
  { reason_id: "demo001-reason-recollection", record_type: "recollection", formed_date: "2025-03-11", formed_at: "2025-03-11T20:00:00+08:00",
    judgment: "构造事后回忆：现在回想，当时可能更关注短期变化，原判断过程记不完整。", expected_evidence: "应寻找当时原始日记，而非将当前记忆当作已知事实。",
    invalidation_condition: "回忆与原记录不一致时，保留差异和不确定性。", source_excerpt: "这是清仓后形成的构造回忆，不能证明买入时已经知道后续信息。" },
].map((reason) => ({ ...common, ...reason, source_url: null, episode_id: null, trade_id: "demo001-buy", symbol: "DEMO001", time_precision: "datetime",
  historical_version_confirmed: true, has_time_conflict: false,
  evidence: evidence(reason.reason_id, ["judgment", "expected_evidence", "invalidation_condition", "formed_at"], { judgment: "文本", formed_at: "ISO8601" },
    reason.formed_date, reason.formed_at, reason.record_type === "recollection" ? "事后回忆形成时间，不能反推为当时已知" : "固定构造当时日记的形成时间"),
}));
const events = [
  { event_id: "demo001-event-prior", title: "构造事件：流程改进说明", published_date: "2025-02-28", published_at: "2025-02-28T18:00:00+08:00",
    excerpt: "虚构示例公司公开了一份流程改进说明。本条只用于演示事前公开信息。" },
  { event_id: "demo001-event-after", title: "构造事件：后续进度补充", published_date: "2025-03-03", published_at: "2025-03-03T18:00:00+08:00",
    excerpt: "构造的进度补充在买入当天18:00才公开，不能作为上午买入的事前依据。" },
  { event_id: "demo001-event-date-only", title: "构造事件：只有公开日期的记录", published_date: "2025-03-03", published_at: null,
    excerpt: "只能确认公开日期，没有小时，不能确定上午买入时是否已经可得。" },
].map((event) => ({ ...common, ...event, episode_id: null, symbol: "DEMO001", occurred_date: null, source_url: null,
  time_precision: event.published_at ? "datetime" : "date", historical_version_confirmed: true, has_time_conflict: false,
  evidence: evidence(event.event_id, ["title", "excerpt", "published_date", "published_at"], { excerpt: "文本", published_at: "ISO8601" },
    event.published_date, event.published_at, "固定构造的首次公开时间；不是现实公告"),
}));
const market_bars = [
  { bar_id: "demo001-bar-before", trade_date: "2025-03-02", open: "9.5", high: "10", low: "9.2", close: "9.8", volume: "1000", turnover: "9800", available_at: "2025-03-02T18:00:00+08:00" },
  { bar_id: "demo001-bar-buy-day", trade_date: "2025-03-03", open: "10", high: "10.5", low: "9.5", close: "9.7", volume: "1200", turnover: "11640", available_at: "2025-03-03T18:00:00+08:00" },
].map(({ available_at, ...bar }) => ({ ...common, ...bar, market_snapshot_id: "demo001-market-v1", symbol: "DEMO001", currency: "CNY", adjust: "none",
  upstream_data_timestamp: null,
  evidence: evidence(bar.bar_id, ["trade_date", "open", "high", "low", "close", "volume", "turnover"],
    { open: "元/股", high: "元/股", low: "元/股", close: "元/股", volume: "股", turnover: "元" },
    bar.trade_date, available_at, "构造日线在18:00才首次可得；不表示真实市场接口的公开时刻"),
}));
const dataset = {
  schema_version: "1.0", dataset_version: "fields-import-v1", case_id: "demo001-fixed-v1",
  label: "DEMO001 固定构造案例（两笔交易）", ...common,
  trades, reasons, events, market_bars, active_reason_id: reasons[0].reason_id,
  import_batches: [{ batch_id: batchId, filename: "demo-trades.csv", imported_at: recorded, data_mode: "constructed", adopted_rows: [2, 3], excluded_rows: [],
    ignored_blank_rows: 0, duplicate_decisions: [], order_confirmations: [] }],
};
const header = "symbol,name,trade_date,trade_time,side,quantity,price,fee,same_day_order";
const buy = "DEMO001,构造示例公司,2025-03-03,10:00:00,BUY,100,10,5,1";
const sell = "DEMO001,构造示例公司,2025-03-10,14:00:00,SELL,100,9,5,1";
await mkdir(output, { recursive: true });
for (const [name, content] of Object.entries({
  "demo-case.json": JSON.stringify(dataset, null, 2),
  "trades-template.csv": header,
  "demo-trades.csv": [header, buy, sell].join("\n"),
  "negative-quantity.csv": [header, buy.replace(",BUY,100,", ",BUY,-100,"), sell].join("\n"),
  "missing-fee.csv": [header, buy.replace(",10,5,", ",10,,"), sell].join("\n"),
})) await writeFile(`${output}/${name}`, content + "\n", "utf8");
console.log("固定 synthetic 案例及 CSV 已生成；未访问外部数据。");
