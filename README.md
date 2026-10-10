# 投资决策复盘与学习

当前阶段：导入、理由输入与统一证据工作台。页面支持导入预览、整批确认、理由新增/版本切换、时间线来源详情和浏览器本地保存；时间分类待计算，复盘报告与清单尚未生成。

## 本地运行

在项目目录执行：

```powershell
npm.cmd install
npm.cmd run dev
```

打开终端显示的地址（通常为 http://localhost:3000）。使用现有 Next.js 16.4.0、React 19.3.0、TypeScript 和 Tailwind CSS；系统字体，无外部字体请求。开发验证使用 Node.js 24.15.0。

## 体验当前功能

1. 点击“一键载入构造案例”：载入固定 DEMO001 两笔交易、两份理由、三条事件和两条日线；全程标记 synthetic，不对应真实公司或新闻。
2. 切换“当时记录 / 事后回忆”，两份原文都保留；刷新后恢复选中版本。
3. 下载 CSV 模板或三个构造 CSV。上传 DEMO001 文件前选择“构造 CSV（仅用于演示）”；真实入口拒绝 DEMO001，构造入口拒绝真实代码。
4. 查看行级错误和警告；负数量阻止整批导入，费用缺失保留未知。疑似重复和无法确定的同日顺序需明确确认，不能静默删除或把行顺序当成真实时刻。
5. 点击确认后才保存；已有数据时明确确认整体替换。本阶段不进行历史插入、持仓合并或自动补充理由/行情/事件。
6. 在导入区为已有交易填写理由、原始摘录、来源及历史形成时间；不清楚时间时保留未知。点击“保存新增理由”，保留原有理由，刷新可恢复。构造案例内新增理由仍标synthetic，真实记录的用户输入未自动验证。
7. 时间线按记录日期汇总交易/理由/事件/行情，点击“查看来源详情”核对原始字段、单位、首次发布时间和取数时间；所有分类显示待计算，同日排列不代表实际先后或事前可知。复盘区显示尚未生成报告，清单区显示尚未生成清单。

数据留在当前浏览器的 `investment-review:fields-import:v1` 键中，不上传到服务器、不跨设备同步。这个阶段格式与 SPEC 最终根对象分开，避免覆盖后续正式存储。写入失败显示未保存并提供当前字段 JSON 下载；另一个标签页修改时暂停写入。localStorage不提供事务保证；可用时使用浏览器锁。通用 JSON 备份恢复和坏数据恢复界面尚未实现。

## 固定素材与协议

- `public/samples/demo-case.json`：完整固定案例，稳定 ID、时间与数值，无随机生成；可下载供后续复用。
- `public/samples/demo-trades.csv`：2025-03-03 10:00 买入100股、价格10元、费用5元；2025-03-10 14:00 卖出100股、价格9元、费用5元。
- `public/samples/negative-quantity.csv`：负数量错误。
- `public/samples/missing-fee.csv`：买入费用缺失，空值不等于零。
- `public/samples/trades-template.csv`：标准九字段空模板。
- `src/lib/domain/schema.ts`：四类严格 Zod schema、共享证据元数据和派生类型。

当前两笔案例按用户2026-10-10指令制作，替代 SPEC 第14节原四笔案例；SPEC 原文未改动。2025-03-02为周日，该日前日行情纯属本阶段要求的构造素材，不代表真实A股交易日。CSV导入仅有交易，不能据此自动生成完整构造理由和新闻。

## 数据源与 AI

页面尚未接入扶摇或 iFinD；没有真实模型调用、外部 AI JSON 导入或报告生成。开发使用 Codex 不等于产品已接入模型。

`.env.example` 是无秘密模板；Key只填写在根目录被忽略的 `.env.local` 的 `FUYAO_API_KEY=` 后，基础地址为 `FUYAO_BASE_URL=https://fuyao.aicubes.cn`。这些配置不进入客户端。

已有本地验证脚本 `npm.cmd run check:data` 会显式读取本地配置并发出一次真实请求，只应在用户准备好凭据并希望验证时执行。本字段导入阶段没有运行它。真实响应目录 `.local/provider-responses/` 被 Git 忽略；真实权限与费用/公开许可仍未验证。详见 `docs/provider-notes.md`。

## 检查与测试

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
npm.cmd run test:domain
npm.cmd run test:data-check
npm.cmd run test:browser
```

浏览器测试使用已安装的 Chrome，连接/启动本项目 localhost:3000（不关闭现有开发服务），测试数据仅留在独立测试浏览器中。测试产物目录被 Git 忽略。`npm.cmd run fixtures:demo` 按固定规则重建合成素材；无网络或随机数。

实测结果与未完成项见 `docs/STATUS.md`、`docs/test-plan.md`；开发AI使用与修正见 `docs/ai-usage-log.md`。
