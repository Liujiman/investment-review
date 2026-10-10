import { expect, test } from "@playwright/test";
import { failures, runFailureMock } from "../fixtures/data-failures.mjs";
import type { Dataset } from "../../src/lib/domain/schema";

// The provider probe is mocked in the Node test runner. The current page has no
// provider adapter: these tests verify its existing unavailable workspace, not
// a simulated production connection or per-error UI that does not exist yet.
for (const scenario of failures) {
  test(`probe mock ${scenario.label}: unavailable workspace retains user data and CSV cash`, async ({ page }) => {
    const external: string[] = [], pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.route("**/*", (route) => {
      if (new URL(route.request().url()).hostname !== "localhost") {
        external.push(route.request().url()); return route.abort();
      }
      return route.continue();
    });
    await page.goto("/");
    await expect(page.getByRole("button", { name: "一键载入构造案例" })).toBeEnabled();
    await page.getByRole("radio", { name: "构造 CSV（仅用于演示）" }).check();
    await page.getByLabel("上传 CSV", { exact: true }).setInputFiles("docs/acceptance-fixtures/trades-closed.csv");
    await page.getByRole("button", { name: "确认整批导入", exact: true }).click();
    const form = page.getByRole("form", { name: "新增事件证据" });
    const saveEvent = async (title: string) => {
      await form.getByLabel("上传证据原文（TXT）").setInputFiles("docs/acceptance-fixtures/event-before.txt");
      await form.getByLabel("事件标题（必填）").fill(title);
      await form.getByLabel("证据来源名称（必填）").fill("用户提供的构造验收材料");
      await form.getByRole("button", { name: "保存新增事件证据" }).click();
      await expect(page.getByRole("article", { name: `事件：${title}`, exact: true })).toBeVisible();
    };
    await saveEvent("故障验收：原有用户事件");
    const before = await page.evaluate(() => localStorage.getItem("investment-review:fields-import:v1"));
    const mock = await runFailureMock(scenario.id);
    expect(mock.check.result).toBe(scenario.expected); expect(mock.calls).toBe(1);
    expect(mock.check.http_status).toBe(scenario.http); expect(mock.check.business_code).toBe(scenario.business);
    expect(await page.evaluate(() => localStorage.getItem("investment-review:fields-import:v1"))).toBe(before);
    await test.info().attach("test-only-probe-result", { body: JSON.stringify({ synthetic_test_only: true, result: mock.check.result, http: mock.check.http_status, code: mock.check.business_code }), contentType: "application/json" });

    const provider = page.locator('[data-source-status="unavailable"]');
    await expect(provider).toContainText("两次记录均为网络失败");
    await expect(provider).toContainText("不能据此判断权限不足");
    await expect(page.locator("#ai-review")).toContainText("尚未生成复盘报告");
    await expect(page.locator("#checklist")).toContainText("尚未生成清单");
    const process = page.getByRole("article", { name: "持仓过程 1 DEMO001" });
    await expect(process).toContainText("仅依据已录入交易暂算");
    await expect(process.getByText("-100.00 元", { exact: true })).toBeVisible();
    await expect(process.getByText("-110.00 元", { exact: true })).toBeVisible();
    await process.getByText("查看计算依赖", { exact: true }).click();
    await expect(process).toContainText("交易ID：");
    await saveEvent("故障验收：失败后仍可保存");
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "下载当前字段数据备份", exact: true }).click();
    expect((await downloadPromise).suggestedFilename()).toBe("investment-fields-backup.json");
    await page.reload(); await expect(page.getByRole("status")).toContainText("已恢复");
    await expect(page.getByRole("article", { name: "事件：故障验收：原有用户事件", exact: true })).toBeVisible();
    await expect(page.getByRole("article", { name: "事件：故障验收：失败后仍可保存", exact: true })).toBeVisible();
    const saved: Dataset = await page.evaluate(() => JSON.parse(localStorage.getItem("investment-review:fields-import:v1")!));
    expect(saved.trades).toHaveLength(2); expect(saved.events).toHaveLength(2);
    expect(saved.market_bars).toEqual([]); expect(saved.reasons).toEqual([]);
    expect([...saved.trades, ...saved.events].every((record) => record.evidence.source_type === "user_provided" && record.evidence.quality.status === "unverified")).toBe(true);
    expect(saved.trades.map((trade) => trade.trade_id)).toEqual(JSON.parse(before!).trades.map((trade: Dataset["trades"][number]) => trade.trade_id));

    await page.getByRole("radio", { name: "构造 CSV（仅用于演示）" }).check();
    await page.getByLabel("上传 CSV", { exact: true }).setInputFiles("docs/acceptance-fixtures/trades-missing-fee.csv");
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "确认整批导入并替换当前数据", exact: true }).click();
    await expect(process).toContainText("已知费用小计（2笔缺失）");
    await expect(process.getByText("-100.00 元", { exact: true })).toBeVisible();
    await expect(process.getByText("未知 / 不计算：费用缺失、未清仓或公司行动限制", { exact: true })).toBeVisible();
    await expect(process.getByText("-110.00 元", { exact: true })).toHaveCount(0);
    const missing: Dataset = await page.evaluate(() => JSON.parse(localStorage.getItem("investment-review:fields-import:v1")!));
    expect(missing.trades.map((trade) => trade.fee)).toEqual([null, null]); expect(missing.market_bars).toEqual([]);
    await expect(provider).toContainText("真实行情：unavailable");
    expect(external).toEqual([]); expect(pageErrors).toEqual([]);
  });
}
