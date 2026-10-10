import { expect, test } from "@playwright/test";

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
  await expect(timeline.getByRole("article")).toHaveCount(9);
  await expect(timeline.getByText("时间分类：待计算", { exact: true })).toHaveCount(10);
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
  await expect(timeline.getByRole("article")).toHaveCount(10);
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
