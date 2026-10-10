import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import type { Dataset } from "../../src/lib/domain/schema";

test("acceptance files use actual user entry, preserve constructed provenance, classify times and withhold missing-fee net", async ({ page }) => {
  const external: string[] = [];
  await page.route("**/*", (route) => {
    if (new URL(route.request().url()).hostname !== "localhost") { external.push(route.request().url()); return route.abort(); }
    return route.continue();
  });
  await page.goto("/"); await expect(page.getByRole("button", { name: "一键载入构造案例" })).toBeEnabled();
  await page.getByRole("radio", { name: "构造 CSV（仅用于演示）" }).check();
  await page.getByLabel("上传 CSV", { exact: true }).setInputFiles("docs/acceptance-fixtures/trades-closed.csv");
  await page.getByRole("button", { name: "确认整批导入", exact: true }).click();
  const form = page.getByRole("form", { name: "新增事件证据" });
  for (const [file, title, precision, time] of [["event-before.txt", "事前材料", "datetime", "09:30:00"], ["event-after.txt", "事后材料", "datetime", "18:00:00"], ["event-date-only.txt", "时间未知材料", "date", ""]]) {
    await form.getByLabel("上传证据原文（TXT）").setInputFiles(`docs/acceptance-fixtures/${file}`);
    await expect(form.getByLabel("事件原始摘录（必填）")).toHaveValue(readFileSync(`docs/acceptance-fixtures/${file}`, "utf8"));
    await form.getByLabel("事件标题（必填）").fill(`构造验收：${title}`);
    await form.getByLabel("证据来源名称（必填）").fill("用户提供的构造验收材料");
    await form.getByLabel("首次发布时间精度").selectOption(precision);
    await form.getByLabel("原始首次公开日期").fill("2025-03-10");
    if (time) await form.getByLabel("原始首次公开时刻（上海）").fill(time);
    else await expect(form.getByLabel("原始首次公开时刻（上海）")).toHaveCount(0);
    await form.getByRole("checkbox").check();
    await form.getByRole("button", { name: "保存新增事件证据" }).click();
    await expect(page.getByRole("article", { name: `事件：构造验收：${title}`, exact: true })).toBeVisible();
  }
  const before = page.getByRole("article", { name: "事件：构造验收：事前材料", exact: true });
  await before.getByText("查看来源详情", { exact: true }).click();
  await expect(before).toContainText("来源类型：user_provided；质量：unverified");
  await expect(before).toContainText("用户提供的构造材料：不对应真实公司、交易或公告；未验证");
  await expect(before).toContainText("2025-03-10T09:30:00+08:00");
  await page.getByLabel("证据可见范围").selectOption("prior");
  await expect(before).toBeVisible();
  await expect(page.getByRole("article", { name: "事件：构造验收：事后材料", exact: true })).toHaveCount(0);
  await expect(page.getByRole("article", { name: "持仓过程 1 DEMO001" })).toHaveCount(0);
  await page.getByLabel("证据可见范围").selectOption("unknown");
  const unknown = page.getByRole("article", { name: "事件：构造验收：时间未知材料", exact: true });
  await unknown.getByText("查看来源详情", { exact: true }).click();
  await expect(unknown).toContainText("首次可得时间：2025-03-10（仅日期，没有小时）");
  await page.getByLabel("证据可见范围").selectOption("all");
  const process = page.getByRole("article", { name: "持仓过程 1 DEMO001" });
  await expect(process.getByText("-110.00 元", { exact: true })).toBeVisible();
  await page.reload(); await expect(page.getByRole("status")).toContainText("已恢复");
  const saved: Dataset = await page.evaluate(() => JSON.parse(localStorage.getItem("investment-review:fields-import:v1")!));
  expect([...saved.trades, ...saved.events].every((record) => record.is_constructed && record.evidence.source_type === "user_provided" && record.evidence.quality.status === "unverified")).toBe(true);
  expect(saved.events.map((event) => event.published_at)).toEqual(["2025-03-10T09:30:00+08:00", "2025-03-10T18:00:00+08:00", null]);
  await page.getByRole("radio", { name: "构造 CSV（仅用于演示）" }).check();
  await page.getByLabel("上传 CSV", { exact: true }).setInputFiles("docs/acceptance-fixtures/trades-missing-fee.csv");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "确认整批导入并替换当前数据", exact: true }).click();
  await expect(process.getByText("-100.00 元", { exact: true })).toBeVisible();
  await expect(process).toContainText("已知费用小计（2笔缺失）");
  await expect(process.getByText("未知 / 不计算：费用缺失、未清仓或公司行动限制", { exact: true })).toBeVisible();
  await expect(process.getByText("-110.00 元", { exact: true })).toHaveCount(0);
  await expect(page.locator('[data-source-status="unavailable"]')).toContainText("网络失败");
  expect(external).toEqual([]);
});

test("load fixed case, switch reason, restore after reload; no external request or page errors", async ({ page }) => {
  const errors: string[] = [], external: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", (route) => {
    if (new URL(route.request().url()).hostname !== "localhost") { external.push(route.request().url()); return route.abort(); }
    return route.continue();
  });
  await page.goto("/");
  const load = page.getByRole("button", { name: "一键载入构造案例" });
  await expect(load).toBeEnabled(); await load.click();
  await expect(page.getByRole("status")).toContainText("已保存");
  await expect(page.getByRole("heading", { name: "当前交易：DEMO001 固定构造案例（两笔交易）" })).toBeVisible();
  await page.getByLabel("选择理由版本").selectOption("demo001-reason-recollection");
  await expect(page.getByRole("status")).toContainText("已保存");
  await expect(page.getByText("事后回忆 · synthetic", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("status")).toContainText("已恢复");
  await expect(page.getByLabel("选择理由版本")).toHaveValue("demo001-reason-recollection");
  await expect(page.getByRole("article", { name: "事件：构造事件：只有公开日期的记录" }).getByText("首次公开日期 / 时刻：2025-03-03（仅日期，没有小时）", { exact: true })).toBeVisible();
  expect(errors).toEqual([]); expect(external).toEqual([]);
});

test("four areas show honest states and timeline details expose original fields and distinct source times", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "一键载入构造案例" })).toBeEnabled();
  await expect(page.getByRole("heading", { name: "尚未生成复盘报告", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "尚未生成清单", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "一键载入构造案例" }).click();
  await expect(page.getByRole("status")).toContainText("已保存");
  const timeline = page.getByRole("region", { name: "02 时间线与统一证据" });
  await expect(timeline.getByRole("article", { name: /^(交易|理由|事件|行情)：/ })).toHaveCount(9);
  await expect(timeline.locator('[aria-label="证据分类数量"]')).toContainText("事前可知 3 · 事后信息 5 · 时间未知 1");
  const event = timeline.getByRole("article", { name: "事件：构造事件：只有公开日期的记录" });
  await event.getByText("查看来源详情", { exact: true }).click();
  await expect(event.getByText("首次发布时间：2025-03-03（仅日期，没有小时）", { exact: true })).toBeVisible();
  await expect(event.getByText("原始摘录", { exact: true })).toBeVisible();
  await expect(event.getByText("来源字段定位与单位", { exact: true })).toBeVisible();
  await expect(event.getByText("取数时间：", { exact: false })).toContainText("2026-10-10");
  await expect(event.getByText("synthetic 构造数据：不对应真实公司、交易或新闻", { exact: true })).toBeVisible();
  const reason = timeline.getByRole("article", { name: "理由：当时记录 · DEMO001" });
  await reason.getByText("查看来源详情", { exact: true }).click();
  await expect(reason.getByText("原始摘录", { exact: true })).toBeVisible();
  await expect(reason.getByText("构造当时记录：尚无法确认流程改进能否持续。", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "尚未生成复盘报告", exact: true })).toBeVisible();
});

test("reason input persists original excerpt and unknown historical time without replacing old versions", async ({ page }) => {
  await page.goto("/"); await expect(page.getByRole("button", { name: "一键载入构造案例" })).toBeEnabled();
  await page.getByRole("button", { name: "一键载入构造案例" }).click();
  const form = page.getByRole("form", { name: "新增交易理由" });
  await form.getByLabel("核心判断（必填）").fill("用户自己记录的复盘问题");
  await form.getByLabel("原始摘录", { exact: true }).fill("这是用户写入的原文，不是自动生成内容。");
  await form.getByLabel("来源名称（必填）").fill("手动构造日记");
  await form.getByRole("button", { name: "保存新增理由" }).click();
  await expect(page.getByRole("status")).toContainText("已保存");
  await expect(page.getByLabel("选择理由版本").locator("option")).toHaveCount(3);
  const timeline = page.getByRole("region", { name: "02 时间线与统一证据" });
  await expect(timeline.getByRole("article", { name: /^(交易|理由|事件|行情)：/ })).toHaveCount(10);
  const unknownGroup = timeline.getByRole("heading", { name: "未提供记录日期", exact: true });
  await expect(unknownGroup).toBeVisible();
  await page.reload(); await expect(page.getByRole("status")).toContainText("已恢复");
  const entry = page.getByRole("region", { name: "02 时间线与统一证据" }).getByRole("article").filter({ hasText: "用户自己记录的复盘问题" });
  await entry.getByText("查看来源详情", { exact: true }).click();
  await expect(entry.getByText("这是用户写入的原文，不是自动生成内容。", { exact: true })).toBeVisible();
  await expect(entry.getByText("首次可得时间：未知，未提供；精度：unknown", { exact: true })).toBeVisible();
  await expect(entry.getByText("取数时间：未取数（本地输入/导入不冒充供应商取数）；时区：Asia/Shanghai", { exact: true })).toBeVisible();
});

test("negative quantity blocks import, missing fee remains unknown and real entry rejects DEMO001", async ({ page }) => {
  await page.goto("/"); await expect(page.getByRole("button", { name: "一键载入构造案例" })).toBeEnabled();
  await page.getByLabel("上传 CSV").setInputFiles("public/samples/demo-trades.csv");
  await expect(page.getByLabel("CSV 校验信息")).toContainText("MODE_MISMATCH");
  await expect(page.getByRole("button", { name: "确认整批导入", exact: true })).toBeDisabled();
  await page.getByRole("radio", { name: "构造 CSV（仅用于演示）" }).check();
  await page.getByRole("button", { name: "一键载入构造案例" }).click();
  await expect(page.getByRole("status")).toContainText("已保存");
  await page.getByLabel("上传 CSV").setInputFiles("public/samples/negative-quantity.csv");
  await expect(page.getByLabel("CSV 校验信息")).toContainText("第2行 · quantity");
  await expect(page.getByRole("button", { name: "确认整批导入并替换当前数据", exact: true })).toBeDisabled();
  await expect(page.getByRole("heading", { name: "当前交易：DEMO001 固定构造案例（两笔交易）" })).toBeVisible();
  await page.getByLabel("上传 CSV").setInputFiles("public/samples/missing-fee.csv");
  await expect(page.getByLabel("CSV 校验信息")).toContainText("费用缺失");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "确认整批导入并替换当前数据", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("已保存");
  await expect(page.getByRole("cell", { name: "未知（未补零）", exact: true })).toBeVisible();
  await page.reload(); await expect(page.getByRole("status")).toContainText("已恢复");
  await expect(page.getByRole("cell", { name: "未知（未补零）", exact: true })).toBeVisible();
});

test("storage quota failure keeps in-memory case and reports unsaved data without false success", async ({ page }) => {
  await page.addInitScript(() => { Storage.prototype.setItem = () => { throw new DOMException("test quota", "QuotaExceededError"); }; });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "一键载入构造案例" })).toBeEnabled();
  await page.getByRole("button", { name: "一键载入构造案例" }).click();
  await expect(page.getByRole("status")).toContainText("保存失败");
  await expect(page.getByRole("heading", { name: "当前交易：DEMO001 固定构造案例（两笔交易）" })).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "下载当前字段数据备份" }).click();
  expect((await downloadPromise).suggestedFilename()).toBe("investment-fields-backup.json");
});

test("second tab detects changed dataset and pauses writes", async ({ page, context }) => {
  await page.goto("/"); await expect(page.getByRole("button", { name: "一键载入构造案例" })).toBeEnabled();
  const second = await context.newPage(); await second.goto("/");
  await expect(second.getByRole("button", { name: "一键载入构造案例" })).toBeEnabled();
  await page.getByRole("button", { name: "一键载入构造案例" }).click();
  await expect(page.getByRole("status")).toContainText("已保存");
  await expect(second.getByRole("status")).toContainText("另一标签页已修改数据");
  await expect(second.getByRole("button", { name: "一键载入构造案例" })).toBeDisabled();
  await second.close();
});

test("download template works and narrow page has no global horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto("/");
  await expect(page.getByRole("button", { name: "一键载入构造案例" })).toBeEnabled();
  const downloadPromise = page.waitForEvent("download"); await page.getByRole("link", { name: "下载空白模板", exact: true }).click();
  expect((await downloadPromise).suggestedFilename()).toBe("trades-template.csv");
  await page.getByRole("button", { name: "一键载入构造案例" }).click();
  await expect(page.getByRole("status")).toContainText("已保存");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("decision filtering recalculates visibility and excludes future results from prior view", async ({ page }) => {
  await page.goto("/"); await expect(page.getByRole("button", { name: "一键载入构造案例" })).toBeEnabled();
  await page.getByRole("button", { name: "一键载入构造案例" }).click();
  const timeline = page.getByRole("region", { name: "02 时间线与统一证据" });
  const process = timeline.getByRole("article", { name: "持仓过程 1 DEMO001" });
  await expect(process.getByText("-100.00 元", { exact: true })).toBeVisible();
  await expect(process.getByText("-110.00 元", { exact: true })).toBeVisible();
  await expect(process.getByText("10.00 元", { exact: true })).toBeVisible();
  await timeline.getByLabel("证据可见范围").selectOption("prior");
  await expect(timeline.getByRole("article")).toHaveCount(3);
  await expect(timeline.getByRole("article", { name: "行情：日线行情 · DEMO001" })).toHaveCount(1);
  await expect(timeline.getByRole("article", { name: "理由：事后回忆 · DEMO001" })).toHaveCount(0);
  await expect(timeline.getByText("-110.00 元", { exact: true })).toHaveCount(0);
  await timeline.getByLabel("选中决策交易").selectOption("demo001-sell");
  await expect(timeline.locator('[aria-label="证据分类数量"]')).toContainText("事前可知 7 · 事后信息 2 · 时间未知 0");
  await expect(timeline.getByRole("article")).toHaveCount(7);
  await timeline.getByLabel("证据可见范围").selectOption("unknown");
  await expect(timeline.getByText("当前分类没有记录，不补造证据。", { exact: true })).toBeVisible();
});

test("corporate action restriction blocks simplified profits and unknown fees only show gross", async ({ page }) => {
  await page.goto("/"); await expect(page.getByRole("button", { name: "一键载入构造案例" })).toBeEnabled();
  await page.getByRole("button", { name: "一键载入构造案例" }).click();
  const process = page.getByRole("article", { name: "持仓过程 1 DEMO001" });
  await process.getByLabel("公司行动口径（本页临时选择，不保存）").selectOption("present");
  await expect(process.getByText("-110.00 元", { exact: true })).toHaveCount(0);
  await expect(process.getByText("不计算：未清仓或存在不支持的公司行动", { exact: true })).toBeVisible();
  await expect(process.getByText("存在分红、拆股、送股或配股等复杂公司行动，简化盈亏计算已阻止。", { exact: true })).toBeVisible();
  await page.getByLabel("证据可见范围").selectOption("prior");
  await page.getByLabel("证据可见范围").selectOption("all");
  await expect(process.getByLabel("公司行动口径（本页临时选择，不保存）")).toHaveValue("present");
  await expect(process.getByText("-110.00 元", { exact: true })).toHaveCount(0);
  await process.getByLabel("公司行动口径（本页临时选择，不保存）").selectOption("none_confirmed");
  await expect(process.getByText("-110.00 元", { exact: true })).toBeVisible();
  await page.getByRole("radio", { name: "构造 CSV（仅用于演示）" }).check();
  await page.getByLabel("上传 CSV").setInputFiles("public/samples/missing-fee.csv");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "确认整批导入并替换当前数据", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("已保存");
  await expect(process.getByText("-100.00 元", { exact: true })).toBeVisible();
  await expect(process.getByText("5.00 元", { exact: true })).toBeVisible();
  await expect(process.getByText("未知 / 不计算：费用缺失、未清仓或公司行动限制", { exact: true })).toBeVisible();
});

test("first sell and oversell block adoption without overwriting case; open buy never pretends liquidation", async ({ page }) => {
  await page.goto("/"); await expect(page.getByRole("button", { name: "一键载入构造案例" })).toBeEnabled();
  await page.getByRole("button", { name: "一键载入构造案例" }).click();
  await page.getByRole("radio", { name: "构造 CSV（仅用于演示）" }).check();
  const header = "symbol,name,trade_date,trade_time,side,quantity,price,fee,same_day_order";
  const buy = "DEMO001,构造公司,2025-03-03,10:00:00,BUY,100,10,5,1";
  const upload = async (rows: string) => page.getByLabel("上传 CSV").setInputFiles({ name: "boundary.csv", mimeType: "text/csv", buffer: Buffer.from(`${header}\n${rows}`) });
  await upload(buy.replace("BUY", "SELL"));
  await expect(page.getByRole("alert").filter({ hasText: "SELL_BEFORE_BUY" })).toBeVisible();
  await expect(page.getByRole("button", { name: "确认整批导入并替换当前数据", exact: true })).toBeDisabled();
  await upload(`${buy}\n${buy.replace("2025-03-03", "2025-03-04").replace("BUY,100", "SELL,101")}`);
  await expect(page.getByRole("alert").filter({ hasText: "OVERSELL" })).toBeVisible();
  await expect(page.getByRole("button", { name: "确认整批导入并替换当前数据", exact: true })).toBeDisabled();
  await expect(page.getByRole("heading", { name: "当前交易：DEMO001 固定构造案例（两笔交易）" })).toBeVisible();
  await upload(buy);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "确认整批导入并替换当前数据", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("已保存");
  const process = page.getByRole("article", { name: "持仓过程 1 DEMO001" });
  await expect(process.getByRole("heading")).toContainText("尚未清仓");
  await expect(process.getByText("当前持仓 100 股", { exact: false })).toBeVisible();
  await expect(process.getByText("不计算：未清仓或存在不支持的公司行动", { exact: true })).toBeVisible();
});

test("unavailable provider stays explicit while user TXT evidence is saved and restored as user-provided", async ({ page }) => {
  const external: string[] = [], errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", (route) => {
    if (new URL(route.request().url()).hostname !== "localhost") { external.push(route.request().url()); return route.abort(); }
    return route.continue();
  });
  await page.goto("/"); await expect(page.getByRole("button", { name: "一键载入构造案例" })).toBeEnabled();
  const provider = page.locator('[data-source-status="unavailable"]');
  await expect(provider).toContainText("真实行情：unavailable");
  await page.getByRole("button", { name: "一键载入构造案例" }).click();
  await expect(provider).toContainText("网络失败");
  await expect(page.getByRole("form", { name: "新增事件证据" })).toContainText("保存新增事件证据");
  const header = "symbol,name,trade_date,trade_time,side,quantity,price,fee,same_day_order";
  await page.getByLabel("上传 CSV", { exact: true }).setInputFiles({ name: "user-test.csv", mimeType: "text/csv", buffer: Buffer.from(`${header}\n600519.SH,用户测试记录,2025-03-03,10:00:00,BUY,100,10,5,1`) });
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "确认整批导入并替换当前数据", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("已保存");
  const form = page.getByRole("form", { name: "新增事件证据" });
  await form.getByLabel("事件标题（必填）").fill("用户上传测试证据");
  await form.getByLabel("证据来源名称（必填）").fill("用户提供测试文本");
  await form.getByLabel("上传证据原文（TXT）").setInputFiles({ name: "my-evidence.txt", mimeType: "text/plain", buffer: Buffer.from("用户原始摘录\n未经过供应商接口。") });
  await expect(form.getByLabel("事件原始摘录（必填）")).toHaveValue("用户原始摘录\n未经过供应商接口。");
  await form.getByRole("button", { name: "保存新增事件证据" }).click();
  await expect(page.getByRole("status")).toContainText("已保存");
  await page.reload(); await expect(page.getByRole("status")).toContainText("已恢复");
  const event = page.getByRole("article", { name: "事件：用户上传测试证据" });
  await expect(event.getByText("时间分类：时间未知", { exact: true })).toBeVisible();
  await expect(event).toContainText("user_provided");
  await event.getByText("查看来源详情", { exact: true }).click();
  await expect(event).toContainText("my-evidence.txt");
  await expect(event).toContainText("首次可得时间：未知，未提供");
  await expect(event).toContainText("未取数（本地输入/导入不冒充供应商取数）");
  await expect(provider).toContainText("真实行情：unavailable");
  const sources = await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem("investment-review:fields-import:v1")!);
    return [...data.trades, ...data.reasons, ...data.events, ...data.market_bars].map((record) => record.evidence.source_type);
  });
  expect(sources).toEqual(["user_provided", "user_provided"]);
  expect(external).toEqual([]); expect(errors).toEqual([]);
});
