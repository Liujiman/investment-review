import { test, expect, type Page, type Download } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { loadDemo } from "../../src/lib/demo";
import { accept, buildA, buildB, confirm, entryFor, synchronize, REVIEW_KEY } from "../../src/lib/review/engine";
import { validA, validB } from "../fixtures/review-outputs";
import { STORAGE_KEY } from "../../src/lib/storage/dataset-store";
import { emptyBoard, exportBoard, importBoard, LEARNING_KEY } from "../../src/lib/learning/board";

async function prepare(page: Page) {
  const data = loadDemo(), ledger = await synchronize(null, data), entry = entryFor(ledger, data, data.trades[0].trade_id);
  confirm(entry, { opening_zero: true, complete: true, no_actions: true, scope: true, evidence_ids: [...data.events, ...data.market_bars].map((e) => e.evidence.evidence_id) });
  const a = await buildA(data, entry, data.trades[0].trade_id); entry.packages.push(a);
  const frozen = await accept(entry, a, JSON.stringify(validA(a))), b = await buildB(data, frozen, a); frozen.packages.push(b);
  ledger.entries = [await accept(frozen, b, JSON.stringify(validB(b)))];
  // Constructed fixture only; seed once, so reload exercises persisted user actions.
  await page.addInitScript(({ datasetKey, reviewKey, datasetRaw, reviewRaw }) => {
    if (!sessionStorage.getItem("learning-seeded")) {
      localStorage.setItem(datasetKey, datasetRaw); localStorage.setItem(reviewKey, reviewRaw); sessionStorage.setItem("learning-seeded", "1");
    }
  }, { datasetKey: STORAGE_KEY, reviewKey: REVIEW_KEY, datasetRaw: JSON.stringify(data), reviewRaw: JSON.stringify(ledger) });
  await page.goto("/"); await expect(page.getByLabel("当前B复盘报告", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "选择当前报告候选", exact: true }).click();
  await expect(page.getByLabel("候选学习问题")).toBeVisible();
}
async function selectAndSave(page: Page) {
  await page.getByRole("checkbox", { name: "采用检查项：1", exact: true }).check();
  await page.getByRole("button", { name: "确认保存清单", exact: true }).click();
  await expect(page.getByLabel("清单保存状态")).toContainText("清单已确认并保存");
}
async function downloadText(download: Download) { const path = await download.path(); if (!path) throw new Error("下载未生成"); return readFile(path, "utf8"); }
test("select/edit/check/delete candidate, save/reload, complete decision and preserve snapshot after template edit/delete", async ({ page }) => {
  const external: string[] = [], errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/*", (route) => { if (new URL(route.request().url()).hostname !== "localhost") { external.push(route.request().url()); return route.abort(); } return route.continue(); });
  await prepare(page);
  await page.getByLabel("候选学习问题").fill("用户编辑后的构造检查问题");
  await page.getByLabel("学习依据", { exact: true }).fill("保留原材料与反证记录");
  await page.getByLabel("适用范围说明").fill("只用于构造记录的资料核验");
  await page.getByRole("checkbox", { name: "已人工检查：1", exact: true }).check();
  await page.getByRole("button", { name: "添加无来源检查项", exact: true }).click();
  await expect(page.getByRole("article", { name: "清单条目2" })).toContainText("缺少报告来源");
  page.once("dialog", (d) => d.accept()); await page.getByRole("article", { name: "清单条目2" }).getByRole("button", { name: "删除条目", exact: true }).click();
  await selectAndSave(page); await page.reload();
  await expect(page.getByLabel("候选学习问题")).toHaveValue("用户编辑后的构造检查问题");
  await expect(page.getByRole("checkbox", { name: "已人工检查：1", exact: true })).toBeChecked();
  await page.getByText("查看清单来源与证据快照", { exact: true }).click();
  await expect(page.locator("#checklist")).toContainText("报告ID：report-"); await expect(page.locator("#checklist")).toContainText("证据ID：B-");
  await expect(page.locator("#checklist")).toContainText("synthetic");
  await page.getByRole("button", { name: "开始下一次决策记录", exact: true }).click();
  const form = page.getByRole("group", { name: "下一次决策记录", exact: true }); await expect(form).toBeVisible();
  await form.getByRole("button", { name: "完成并保存决策记录", exact: true }).click(); await expect(page.getByLabel("清单操作错误")).toContainText("理由和反证");
  await form.getByLabel("决策理由", { exact: true }).fill("先核验原材料是否完整"); await form.getByLabel("反证条件", { exact: true }).fill("独立核验与原记录矛盾时重新评估");
  await form.getByLabel("检查状态：1", { exact: true }).selectOption("not_applicable");
  await form.getByRole("button", { name: "完成并保存决策记录", exact: true }).click(); await expect(page.getByLabel("清单操作错误")).toContainText("不适用");
  await form.getByLabel("检查说明：1", { exact: true }).fill("此构造记录不涉及该项");
  await form.getByLabel("用户证据文本或链接：1", { exact: true }).fill("用户构造核验记录（未独立核验）");
  await form.getByRole("button", { name: "完成并保存决策记录", exact: true }).click(); await page.reload();
  await expect(form.getByLabel("决策理由", { exact: true })).toHaveValue("先核验原材料是否完整"); await expect(form.getByLabel("决策理由", { exact: true })).toBeDisabled();
  await page.getByLabel("候选学习问题").fill("后续修改的模板问题"); await page.getByRole("button", { name: "确认保存清单", exact: true }).click();
  await expect(form).toContainText("检查项：用户编辑后的构造检查问题"); await expect(form).toContainText("清单版本：1");
  page.once("dialog", (d) => d.accept()); await page.getByRole("button", { name: "删除清单模板", exact: true }).click();
  await expect(form).toContainText("来源模板已删除"); await expect(form).toContainText("检查项：用户编辑后的构造检查问题");
  await form.getByRole("button", { name: "退回草稿并保存", exact: true }).click(); await expect(form.getByLabel("决策理由", { exact: true })).toBeEnabled();
  await expect(page.locator("#checklist")).toContainText("没有云同步"); expect(external).toEqual([]); expect(errors).toEqual([]);
});
test("export and UTF8 file import restore source snapshots/edited state/scope; wrong JSON leaves stored board untouched", async ({ page }) => {
  await prepare(page); await page.getByLabel("候选学习问题").fill("导出保留用户编辑的构造问题"); await selectAndSave(page);
  const first = page.waitForEvent("download"); await page.getByRole("button", { name: "导出清单与决策备份", exact: true }).click(); const raw = await downloadText(await first);
  const backup = await importBoard(raw); expect(backup.sources).toHaveLength(1); expect(backup.checklists[0].items[0].user_edited).toBe(true);
  const before = await page.evaluate((key) => localStorage.getItem(key), LEARNING_KEY);
  await page.getByText("导入清单与决策备份", { exact: true }).click();
  await page.getByLabel("粘贴清单JSON备份").fill("{bad"); await page.getByRole("button", { name: "校验清单备份", exact: true }).click(); await expect(page.getByLabel("清单操作错误")).toContainText("非法JSON");
  expect(await page.evaluate((key) => localStorage.getItem(key), LEARNING_KEY)).toBe(before);
  const forged = JSON.parse(raw); forged.board.sources[0].review.entries[0].packages[1].input_hash = "0".repeat(64);
  await page.getByLabel("粘贴清单JSON备份").fill(JSON.stringify(forged)); await page.getByRole("button", { name: "校验清单备份", exact: true }).click();
  await expect(page.getByLabel("清单操作错误")).toContainText("哈希已改变"); expect(await page.evaluate((key) => localStorage.getItem(key), LEARNING_KEY)).toBe(before);
  await page.getByLabel("粘贴清单JSON备份").fill(await exportBoard(emptyBoard(), false)); await page.getByRole("button", { name: "校验清单备份", exact: true }).click();
  page.once("dialog", (d) => d.accept()); await page.getByRole("button", { name: "确认替换并保存备份", exact: true }).click(); await expect(page.getByLabel("候选学习问题")).toHaveCount(0);
  await page.getByLabel("上传清单JSON备份").setInputFiles({ name: "constructed-learning.json", mimeType: "application/json", buffer: Buffer.from(raw, "utf8") });
  await expect(page.getByLabel("清单保存状态")).toContainText("文件已读取"); await page.getByRole("button", { name: "校验清单备份", exact: true }).click();
  page.once("dialog", (d) => d.accept()); await page.getByRole("button", { name: "确认替换并保存备份", exact: true }).click(); await page.reload();
  await expect(page.getByLabel("候选学习问题")).toHaveValue("导出保留用户编辑的构造问题");
  const restored = JSON.parse((await page.evaluate((key) => localStorage.getItem(key), LEARNING_KEY))!); expect(restored.sources).toEqual(backup.sources); expect(restored.checklists[0].scope).toEqual(backup.checklists[0].scope);
});
test("quota failure retains unsaved edits/export, failed import preserves current saved data", async ({ page }) => {
  await prepare(page); await selectAndSave(page);
  const before = await page.evaluate((key) => localStorage.getItem(key), LEARNING_KEY);
  await page.evaluate((key) => { const original = Storage.prototype.setItem; Storage.prototype.setItem = function(k, v) { if (k === key) throw new DOMException("mock capacity", "QuotaExceededError"); original.call(this, k, v); }; }, LEARNING_KEY);
  await page.getByLabel("候选学习问题").fill("容量失败时保留的用户草稿"); await page.getByRole("button", { name: "确认保存清单", exact: true }).click();
  await expect(page.getByLabel("清单操作错误")).toContainText("容量不足，未保存"); await expect(page.getByLabel("清单保存状态")).toContainText("未保存草稿");
  expect(await page.evaluate((key) => localStorage.getItem(key), LEARNING_KEY)).toBe(before);
  const promise = page.waitForEvent("download"); await page.getByRole("button", { name: "导出清单与决策备份", exact: true }).click(); const raw = JSON.parse(await downloadText(await promise));
  expect(raw.persistence).toBe("unsaved_draft"); expect(raw.board.checklists[0].items[0].question).toBe("容量失败时保留的用户草稿");
  await page.getByText("导入清单与决策备份", { exact: true }).click(); await page.getByLabel("粘贴清单JSON备份").fill(await exportBoard(emptyBoard(), false)); await page.getByRole("button", { name: "校验清单备份", exact: true }).click();
  page.once("dialog", (d) => d.accept()); await page.getByRole("button", { name: "确认替换并保存备份", exact: true }).click(); await expect(page.getByLabel("清单操作错误")).toContainText("容量不足，未保存");
  expect(await page.evaluate((key) => localStorage.getItem(key), LEARNING_KEY)).toBe(before); await expect(page.getByLabel("候选学习问题")).toHaveValue("容量失败时保留的用户草稿");
});
test("unavailable storage recovery protects unknown data; source-free draft can export but cannot claim saved", async ({ page }) => {
  await page.addInitScript((key) => { const original = Storage.prototype.getItem; Storage.prototype.getItem = function(k) { if (k === key) throw new DOMException("mock blocked", "SecurityError"); return original.call(this, k); }; }, LEARNING_KEY);
  await page.goto("/"); await expect(page.getByLabel("清单操作错误")).toContainText("本地存储不可用");
  await page.getByRole("button", { name: "新建无报告来源清单", exact: true }).click(); await page.getByRole("button", { name: "添加无来源检查项", exact: true }).click();
  await expect(page.getByRole("button", { name: "确认保存清单", exact: true })).toBeDisabled(); await expect(page.locator("#checklist")).toContainText("缺少报告来源");
  const promise = page.waitForEvent("download"); await page.getByRole("button", { name: "导出清单与决策备份", exact: true }).click(); const backup = JSON.parse(await downloadText(await promise));
  expect(backup.persistence).toBe("unsaved_draft"); expect(backup.board.sources).toEqual([]); expect(backup.board.checklists[0].items[0].origin).toBeNull();
});
test("reason change marks source expired and requires acknowledgement; old snapshot remains usable", async ({ page }) => {
  await prepare(page); await selectAndSave(page);
  const source = JSON.parse((await page.evaluate((key) => localStorage.getItem(key), LEARNING_KEY))!).sources;
  const form = page.getByRole("form", { name: "新增交易理由" }); await form.getByLabel("核心判断（必填）").fill("新增的构造回忆理由"); await form.getByLabel("来源名称（必填）").fill("构造日记"); await form.getByRole("button", { name: "保存新增理由", exact: true }).click();
  await expect(page.getByLabel("复盘操作状态")).toContainText("已过期"); await expect(page.locator("#checklist")).toContainText("来源已过期");
  await page.getByRole("button", { name: "开始下一次决策记录", exact: true }).click(); await expect(page.getByLabel("清单操作错误")).toContainText("须明确确认");
  await page.getByRole("checkbox", { name: "我确认沿用过期或当前无法核对的来源（含缺来源条目），保留限制", exact: true }).check();
  await page.getByRole("button", { name: "开始下一次决策记录", exact: true }).click(); await expect(page.getByRole("group", { name: "下一次决策记录" })).toContainText("来源已过期");
  const after = JSON.parse((await page.evaluate((key) => localStorage.getItem(key), LEARNING_KEY))!); expect(after.sources).toEqual(source); expect(after.decisions[0].source_status_at_start).toBe("expired");
});
test("cross-tab edits pause saves and preserve local draft", async ({ page }) => {
  await prepare(page); await selectAndSave(page); await page.getByLabel("候选学习问题").fill("未保存本标签页修改");
  await page.evaluate((key) => window.dispatchEvent(new StorageEvent("storage", { key, newValue: "other-tab" })), LEARNING_KEY);
  await expect(page.getByLabel("清单操作错误")).toContainText("另一标签页"); await expect(page.getByRole("button", { name: "确认保存清单", exact: true })).toBeDisabled(); await expect(page.getByLabel("候选学习问题")).toHaveValue("未保存本标签页修改");
});
