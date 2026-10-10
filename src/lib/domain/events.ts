import { datasetSchema, eventSchema, type Dataset } from "./schema";

export type EventInput = {
  symbol: string; title: string; excerpt: string; source_name: string; source_url: string;
  published_date: string; published_time: string; time_precision: "unknown" | "date" | "datetime";
  historical_version_confirmed: boolean; filename: string | null;
};

export function decodeEvidenceText(bytes: Uint8Array, filename: string): string {
  if (!/\.txt$/i.test(filename)) throw new Error("仅支持 UTF-8 .txt 原文；PDF、图片和网页自动提取尚未实现。");
  if (bytes.byteLength > 64 * 1024) throw new Error("原文文件超过64KiB，请自行选择必要摘录。");
  let text: string;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { throw new Error("文件不是可靠的UTF-8文本，请转换编码后重试。"); }
  if (!text.trim() || text.length > 2000) throw new Error("原文须为1至2000字符；不会自动截断或补写。");
  return text;
}

export function appendEvent(dataset: Dataset, input: EventInput, now = new Date().toISOString(), id: string = crypto.randomUUID()): Dataset {
  if (!dataset.trades.some((trade) => trade.symbol === input.symbol)) throw new Error("请选择当前交易中的证券。");
  const synthetic = dataset.data_mode === "constructed";
  const date = input.time_precision === "unknown" ? null : input.published_date;
  const at = input.time_precision === "datetime" ? `${input.published_date}T${input.published_time.length === 5 ? `${input.published_time}:00` : input.published_time}+08:00` : null;
  const filename = input.filename?.split(/[\\/]/).at(-1)?.slice(0, 255) ?? null;
  const event = eventSchema.parse({
    event_id: id, episode_id: null, symbol: input.symbol, title: input.title.trim(), excerpt: input.excerpt,
    source_url: input.source_url.trim() || null, occurred_date: null, published_date: date, published_at: at,
    time_precision: input.time_precision, historical_version_confirmed: input.historical_version_confirmed, has_time_conflict: false,
    data_mode: dataset.data_mode, is_constructed: synthetic, created_at: now, updated_at: now,
    evidence: {
      evidence_id: `evidence-${id}`, source_type: "user_provided",
      source_name: input.source_name.trim(), source_reference: `local-event:${id}${filename ? `/file:${filename}` : "/manual-text"}`,
      source_fields: { title: "用户填写/title", excerpt: filename ? `${filename}/用户上传并确认的摘录` : "用户填写/excerpt",
        published_date: "用户填写/published_date", published_at: "用户填写/published_at", source_url: "用户填写/source_url" },
      units: { title: "文本", excerpt: "文本", published_date: "上海自然日", published_at: "ISO8601" },
      timezone: "Asia/Shanghai", fetched_at: null,
      first_available: { date, at, precision: input.time_precision, basis: "用户填写的原始首次发布时间，未独立核验；文件读取/当前录入时间不作为历史可得证明" },
      quality: { status: "unverified", notes: [
        synthetic ? "用户提供的构造演示资料，未验证，不对应真实公司或公告" : "用户上传/录入，非供应商返回值；真实性、使用许可和历史版本未独立核验",
        "没有访问原文链接或调用接口；fetched_at保持null；管理时间不是公开时间",
        ...(input.historical_version_confirmed ? ["历史版本仅由用户声明确认"] : ["历史版本未确认，不进入事前证据"]),
      ] },
    },
  });
  if (!event.excerpt.trim()) throw new Error("请提供原始摘录，不自动生成事件内容。");
  return datasetSchema.parse({ ...dataset, updated_at: now, events: [...dataset.events, event] });
}
