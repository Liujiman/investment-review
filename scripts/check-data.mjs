import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { configuration, query, redact, requestOnce, shanghaiTime, updateNotes } from "./data-probe.mjs";
export { configuration, inspectResponse, query, redact, requestOnce, shanghaiDate, updateNotes } from "./data-probe.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = ".local/provider-responses";
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
