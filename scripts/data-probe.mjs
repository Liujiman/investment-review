// Shared pure validation and single-request logic; no environment reads or record writes.
import { parseEnv } from "node:util";

export const query = Object.freeze({
  thscode: "600519.SH", interval: "1d", adjust: "none",
  start: "1788192000000", end: "1790351999999",
});
const endpoint = "/api/a-share/prices/historical";

export function configuration(text) {
  const env = parseEnv(text.replace(/^\uFEFF/, ""));
  const key = env.FUYAO_API_KEY?.trim();
  if (!key || /[\r\n]/.test(key)) throw new Error("DATA_SOURCE_NOT_CONFIGURED");
  let base;
  try { base = new URL(env.FUYAO_BASE_URL || "https://fuyao.aicubes.cn"); }
  catch { throw new Error("DATA_SOURCE_BASE_URL_INVALID"); }
  if (base.origin !== "https://fuyao.aicubes.cn" || base.username || base.password ||
      base.pathname !== "/" || base.search || base.hash) {
    throw new Error("DATA_SOURCE_BASE_URL_INVALID");
  }
  const url = new URL(endpoint, base);
  url.search = new URLSearchParams(query).toString();
  return { key, url };
}

export function redact(text, key) {
  const forms = new Set([key, encodeURIComponent(key), JSON.stringify(key).slice(1, -1)]);
  let result = text;
  for (const value of [...forms].sort((a, b) => b.length - a.length)) {
    if (value) result = result.split(value).join("[REDACTED]");
  }
  return result;
}

export function shanghaiDate(timestamp) {
  if (!Number.isSafeInteger(timestamp) || !Number.isFinite(new Date(timestamp + 8 * 3600_000).getTime())) return null;
  return new Date(timestamp + 8 * 3600_000).toISOString().slice(0, 10);
}

export function shanghaiTime(timestamp) {
  if (shanghaiDate(timestamp) === null) return null;
  return new Date(timestamp + 8 * 3600_000).toISOString().replace("Z", "+08:00");
}

export function inspectResponse(status, text) {
  let body;
  try { body = JSON.parse(text); } catch { body = null; }
  const object = body && typeof body === "object" && !Array.isArray(body);
  const code = object && Number.isInteger(body.code) ? body.code : null;
  const data = object && body.data && typeof body.data === "object" ? body.data : null;
  const items = Array.isArray(data?.item) ? data.item : null;
  const errors = [];
  const dates = [];
  const seen = new Set();
  const rowsByDate = new Map();
  let conflictingRows = false;
  if (items) {
    items.forEach((bar, index) => {
      const date = shanghaiDate(bar?.date_ms);
      if (date && rowsByDate.has(date)) {
        const previous = rowsByDate.get(date);
        if (["open_price", "high_price", "low_price", "close_price", "volume", "turnover"].some((field) => previous?.[field] !== bar?.[field])) {
          conflictingRows = true;
          errors.push(`data.item[${index}]：同标的、同日期、同请求口径的行情数值冲突，不选择任意版本`);
        }
      }
      if (date) rowsByDate.set(date, bar);
      if (!date || seen.has(date) || date < "2026-09-01" || date > "2026-09-25") {
        errors.push(`data.item[${index}].date_ms：日期无效、重复或越界`);
      }
      if (date) { dates.push(date); seen.add(date); }
      const prices = [bar?.open_price, bar?.high_price, bar?.low_price, bar?.close_price];
      if (!prices.every((value) => typeof value === "number" && Number.isFinite(value) && value > 0) ||
          !(bar.low_price <= Math.min(bar.open_price, bar.close_price) &&
            bar.high_price >= Math.max(bar.open_price, bar.close_price))) {
        errors.push(`data.item[${index}]：价格类型或 OHLC 关系不成立`);
      }
      for (const field of ["volume", "turnover"]) {
        if (typeof bar?.[field] !== "number" || !Number.isFinite(bar[field]) || bar[field] < 0) {
          errors.push(`data.item[${index}].${field}：必须为非负有限数值`);
        }
      }
      if (bar?.thscode !== undefined && bar.thscode !== query.thscode) {
        errors.push(`data.item[${index}].thscode：标的不匹配`);
      }
    });
  }
  let result;
  if (status === 429) result = "DATA_SOURCE_RATE_LIMITED";
  else if (status === 401) result = "DATA_SOURCE_AUTH_FAILED";
  else if (status === 403) result = "DATA_SOURCE_PERMISSION_DENIED";
  else if (status < 200 || status >= 300) result = "DATA_SOURCE_HTTP_ERROR";
  else if (!object || code === null) result = "DATA_SOURCE_SCHEMA_INVALID";
  else if (code === 4001) result = "DATA_SOURCE_RATE_LIMITED";
  else if (code === 2001) result = "DATA_SOURCE_AUTH_FAILED";
  else if (code === 2003) result = "DATA_SOURCE_PERMISSION_DENIED";
  else if (code !== 0) result = "DATA_SOURCE_UPSTREAM_ERROR";
  else {
    if (typeof body.message !== "string" || typeof body.request_id !== "string" || !body.request_id.trim()) {
      errors.push("信封 message / request_id 缺失或类型异常");
    }
    if (!items) errors.push("data.item 不是数组");
    if (shanghaiDate(data?.timestamp) === null) errors.push("data.timestamp 不是有效毫秒时间戳");
    result = conflictingRows ? "DATA_SOURCE_CONFLICT" : errors.length ? "DATA_SOURCE_SCHEMA_INVALID" : items.length ? "SUCCESS" : "EMPTY_RESULT";
  }
  dates.sort();
  return {
    result, http_status: status, business_code: code,
    business_message: object && typeof body.message === "string" ? body.message : null,
    request_id: object && typeof body.request_id === "string" ? body.request_id : null,
    item_count: items?.length ?? null,
    coverage_start_date: dates[0] ?? null, coverage_end_date: dates.at(-1) ?? null,
    provider_data_timestamp: data?.timestamp ?? null,
    provider_data_time_shanghai: shanghaiTime(data?.timestamp),
    validation_errors: errors,
    warnings: ["覆盖区间不证明每个交易日都有记录；未核对交易日历。", "当前获取的历史行情，不证明历史原始版本或逐条首次公开时间。"],
  };
}

export function updateNotes(notes, summary) {
  const cell = (value) => value === null || value === undefined ? "未取得" :
    String(value).replace(/[\r\n]/g, " ").replace(/\|/g, "&#124;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const rows = [
    ["执行时间", summary.started_at_shanghai], ["运行环境", `Node ${summary.node_version}（本地独立脚本）`],
    ["端点", endpoint], ["标的／周期／口径", "600519.SH / 1d / none（请求参数，不冒充响应字段）"],
    ["区间", "2026-09-01 至 2026-09-25，Asia/Shanghai"],
    ["HTTP状态", summary.http_status], ["code / message", `${cell(summary.business_code)} / ${cell(summary.business_message)}`],
    ["request_id", summary.request_id], ["item数量", summary.item_count],
    ["实际最早／最晚日期", `${cell(summary.coverage_start_date)} / ${cell(summary.coverage_end_date)}`],
    ["data.timestamp及其转换值", `${cell(summary.provider_data_timestamp)} / ${cell(summary.provider_data_time_shanghai)}`],
    ["字段类型与空值检查", summary.http_status === null ? "未执行：未取得响应" :
      summary.validation_errors.length ? summary.validation_errors.slice(0, 10).join("；") :
        ["SUCCESS", "EMPTY_RESULT"].includes(summary.result) ? "通过" : "未通过完整成功响应验证"],
    ["复权参数保存／日期边界检查", `已保存请求 interval=1d / adjust=none；${["SUCCESS", "EMPTY_RESULT"].includes(summary.result) ? "返回日期边界校验通过" : "未通过完整响应校验"}`],
    ["响应本地位置", summary.response_file ?? "未取得响应；仅保存核查摘要"],
    ["核查摘要位置", summary.summary_file],
    ["成功或失败及原因", summary.result === "SUCCESS" ? "通过：真实响应字段校验成功；尚未接入页面或证据包" :
      summary.result === "EMPTY_RESULT" ? "空结果：HTTP 与业务成功，但无日线，未生成数据" : `失败：${summary.result}；未使用构造数据替代`],
  ];
  const section = `## 11. 实际调用记录（步骤7.5后更新）\n\n以下为最近一次真实请求尝试的记录；历史响应与摘要保留在本地忽略目录。网络失败不代表取得了供应商响应。\n\n| 字段 | 当前值 |\n|---|---|\n${rows.map(([label, value]) => `| ${label} | ${cell(value)} |`).join("\n")}\n\n供应商数据时间不等于逐条首次公开时间；覆盖范围不等于完整交易日覆盖。没有填充缺失日线，没有静默回退构造数据。\n\n`;
  const pattern = /^## 11\.[\s\S]*?(?=^## 12\.)/m;
  if (!pattern.test(notes)) throw new Error("PROVIDER_NOTES_SECTION_NOT_FOUND");
  return notes.replace(pattern, () => section);
}

export async function requestOnce(config, fetchImpl = fetch) {
  let responseText = null;
  let check = {
    result: "DATA_SOURCE_NETWORK_ERROR", http_status: null, business_code: null, business_message: null,
    request_id: null, item_count: null, coverage_start_date: null, coverage_end_date: null,
    provider_data_timestamp: null, provider_data_time_shanghai: null, validation_errors: [], warnings: [],
  };
  const signal = AbortSignal.timeout(15_000);
  try {
    const response = await fetchImpl(config.url, {
      method: "GET", headers: { "X-api-key": config.key, Accept: "application/json" },
      redirect: "error", signal,
    });
    check.http_status = response.status;
    responseText = redact(await response.text(), config.key);
    check = inspectResponse(response.status, responseText);
  } catch (error) {
    check.result = signal.aborted || error?.name === "TimeoutError" ? "DATA_SOURCE_TIMEOUT" : "DATA_SOURCE_NETWORK_ERROR";
    // Do not emit raw exceptions: they can contain request or credential details.
  }
  return { check, responseText };
}

