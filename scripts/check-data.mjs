import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseEnv } from "node:util";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const query = Object.freeze({
  thscode: "600519.SH", interval: "1d", adjust: "none",
  start: "1788192000000", end: "1790351999999",
});
const endpoint = "/api/a-share/prices/historical";
const outputDirectory = ".local/provider-responses";

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

function shanghaiTime(timestamp) {
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
  if (items) {
    items.forEach((bar, index) => {
      const date = shanghaiDate(bar?.date_ms);
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
  if (status === 429 || code === 4001) result = "DATA_SOURCE_RATE_LIMITED";
  else if (status === 401 || code === 2001) result = "DATA_SOURCE_AUTH_FAILED";
  else if (status === 403 || code === 2003) result = "DATA_SOURCE_PERMISSION_DENIED";
  else if (status < 200 || status >= 300) result = "DATA_SOURCE_HTTP_ERROR";
  else if (!object || code === null) result = "DATA_SOURCE_SCHEMA_INVALID";
  else if (code !== 0) result = "DATA_SOURCE_UPSTREAM_ERROR";
  else {
    if (typeof body.message !== "string" || typeof body.request_id !== "string" || !body.request_id.trim()) {
      errors.push("信封 message / request_id 缺失或类型异常");
    }
    if (!items) errors.push("data.item 不是数组");
    if (shanghaiDate(data?.timestamp) === null) errors.push("data.timestamp 不是有效毫秒时间戳");
    result = errors.length ? "DATA_SOURCE_SCHEMA_INVALID" : items.length ? "SUCCESS" : "EMPTY_RESULT";
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

async function main() {
  let config;
  try { config = configuration(await readFile(join(root, ".env.local"), "utf8")); }
  catch {
    console.error("配置未通过检查：请在项目根目录 .env.local 填写 FUYAO_API_KEY，并使用文档规定的 FUYAO_BASE_URL。没有发出请求。第11节未修改。");
    process.exitCode = 1;
    return;
  }
  let notes;
  try {
    const gitOptions = { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] };
    for (const file of [".env.local", `${outputDirectory}/check.json`]) {
      execFileSync("git", ["check-ignore", "--quiet", "--", file], gitOptions);
    }
    const tracked = execFileSync("git", ["ls-files", "--", ".env.local", outputDirectory], gitOptions);
    if (tracked.trim()) throw new Error("PRIVATE_FILES_TRACKED");
    notes = await readFile(join(root, "docs/provider-notes.md"), "utf8");
    if (!/^## 11\.[\s\S]*?^## 12\./m.test(notes)) throw new Error("PROVIDER_NOTES_SECTION_NOT_FOUND");
    await mkdir(join(root, outputDirectory), { recursive: true });
  } catch {
    console.error("本地准备失败：检查 Git 忽略规则、已跟踪私有文件、provider-notes 第11节和目录权限。没有发出请求。");
    process.exitCode = 1;
    return;
  }
  const started = Date.now();
  const runId = `${new Date(started).toISOString().replace(/[:.]/g, "-")}-${randomUUID()}`;
  const summaryFile = `${outputDirectory}/${runId}.summary.json`;
  const responseFile = `${outputDirectory}/${runId}.response.txt`;
  console.log("开始单次真实日线核查：600519.SH / 1d / none；15秒超时，不重试，不跟随重定向。");
  const { check, responseText } = await requestOnce(config);
  const summary = {
    source: "provider_api", request_attempted: true, started_at: new Date(started).toISOString(),
    started_at_shanghai: shanghaiTime(started), completed_at: new Date().toISOString(),
    retrieved_at: responseText === null ? null : new Date().toISOString(),
    node_version: process.version, request: { method: "GET", url: config.url.href, ...query },
    units: { prices: "CNY 元/股", volume: "股", turnover: "CNY 元" },
    timestamp_basis: "data.timestamp：序列最新上游有效时间／数据就绪时间，不是逐条首次公开时间",
    timeout_ms: 15_000, attempts: 1, ...check,
    response_file: responseText === null ? null : responseFile, summary_file: summaryFile,
  };
  try {
    if (responseText !== null) await writeFile(join(root, responseFile), responseText, { encoding: "utf8", flag: "wx" });
    await writeFile(join(root, summaryFile), redact(JSON.stringify(summary, null, 2), config.key) + "\n", { encoding: "utf8", flag: "wx" });
    // Reload so unrelated edits made while the request was pending are retained.
    notes = await readFile(join(root, "docs/provider-notes.md"), "utf8");
    await writeFile(join(root, "docs/provider-notes.md"), updateNotes(notes, summary), "utf8");
  } catch {
    console.error("真实请求已尝试，但本地响应/摘要保存或第11节更新失败。检查本地目录权限；不能据此宣称记录完成。");
    process.exitCode = 1;
    return;
  }
  console.log(`核查结果：${check.result}；HTTP=${check.http_status ?? "未取得"}；业务code=${check.business_code ?? "未取得"}；记录数=${check.item_count ?? "未取得"}`);
  console.log(`摘要保存至 ${summaryFile}；provider-notes 第11节已按实际结果更新。`);
  if (check.result !== "SUCCESS") process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => {
    console.error("核查脚本失败；未打印原始异常，请检查本地配置与输出目录。");
    process.exitCode = 1;
  });
}
