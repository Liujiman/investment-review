# 第11.4步数据失败状态验收报告

记录时间：2026-10-10 15:47:44 +08:00（Asia/Shanghai）。执行目录：`D:\AI PM\Projects\investment-review`。

结论：九类故障的**测试mock**分类及当前unavailable工作台回归通过。没有执行真实供应商验证，没有修改Key、删除配置或改变权限。真实状态仍unavailable，原两次网络失败不能解释为已确认权限不足。

## 实际命令、退出码和数量

先读取package.json、AGENTS、SPEC、provider-notes、现有探测脚本与页面状态，并查阅当前Next客户端指南。

| 实际命令 | 退出码 | 状态 | 通过 | 失败 | 跳过 |
| --- | --- | --- | --- | --- | --- |
| `npm.cmd run test:data-check`（首次、提取模块后复查） | 各0 | 通过 | 每次19 | 0 | 0 |
| `npm.cmd run test:domain` | 0 | 通过 | 35 | 0 | 0 |
| `npm.cmd run test:browser -- --reporter=list,json --output=test-results/data-failure`（首次） | 1 | 失败：加载模块失败，测试未开始 | 0 | 0个用例；1个运行器加载错误 | 0 |
| `npm.cmd run test:browser -- --reporter=list,json --output=test-results/data-failure`（修复后） | 0 | 通过 | 21 | 0 | 0 |
| `npm.cmd run typecheck`（首次、修复后） | 各0 | 通过 | 未提供 | 未提供 | 未提供 |
| `npm.cmd run lint`（首次、修复后） | 各0 | 通过 | 未提供 | 未提供 | 未提供 |

修复后的浏览器命令在PowerShell中实际设置了JSON报告输出位置：

```powershell
$env:PLAYWRIGHT_JSON_OUTPUT_FILE='test-results/data-failure-report.json'
npm.cmd run test:browser -- --reporter=list,json --output=test-results/data-failure
Remove-Item Env:\PLAYWRIGHT_JSON_OUTPUT_FILE
```

JSON报告统计：expected=21、unexpected=0、skipped=0、flaky=0、errors=[]，开始时间2026-10-10T07:46:34.153Z（上海15:46:34），耗时33.924秒。该文件属于Git忽略的测试产物；模拟摘要附件位于测试产物中，不写入真实供应商记录目录。最终三套测试合计75项通过/0失败/0跳过，不累计重复运行次数。首次运行器失败已保留，不以最终通过覆盖首次失败。

## 九类故障覆盖

输入定义在 `tests/fixtures/data-failures.mjs`，只被测试导入。单测位于 `scripts/check-data.test.mjs` 的九个 `failure mock` 用例；浏览器位于 `tests/browser/data-failures.spec.ts` 的九个 `probe mock` 用例。每行两类测试最终均通过。

| 构造故障 | mock HTTP / 业务code | 实际分类结果 |
| --- | --- | --- |
| 网络失败 | 未取得 / 未取得 | DATA_SOURCE_NETWORK_ERROR |
| 超时 | 未取得 / 未取得 | DATA_SOURCE_TIMEOUT |
| 鉴权失败 | 401 / 2001 | DATA_SOURCE_AUTH_FAILED |
| 权限不足 | 403 / 2003 | DATA_SOURCE_PERMISSION_DENIED |
| 429限流 | 429 / 4001 | DATA_SOURCE_RATE_LIMITED |
| 空数据 | 200 / 0，item=[] | EMPTY_RESULT，不生成日线 |
| HTTP200但业务失败 | 200 / 5003 | DATA_SOURCE_UPSTREAM_ERROR |
| 必要字段缺失 | 200 / 0，缺close_price | DATA_SOURCE_SCHEMA_INVALID，不补字段 |
| 同口径数据冲突 | 200 / 0，同标的/日期/1d/none，两条close_price不同 | DATA_SOURCE_CONFLICT，保留冲突说明，不选择任意版本 |

空数据不是权限不足或网络失败，也不等于取得可用行情。超时通过mock抛出TimeoutError验收分类，没有真实等待15秒或发送请求；已有单测另检查请求挂载AbortSignal和禁止重定向。同口径冲突当前限定为同次日线响应的重复日期数值不同，不宣称已实现跨快照版本比较。

## 产品行为与实际覆盖边界

当前页面没有供应商请求适配层，不会调用探测脚本。故障mock在Node测试运行器中执行`requestOnce`的注入fetch；浏览器同步检验**现有unavailable工作台**。没有通过页面请求拦截假装未接入的接口已被调用，也没有把mock错误改写到真实状态横幅。九类详细错误分类通过脚本单测验证；页面九类错误提示联动尚未实现，不能标为通过。

| 检查要求 | 实际覆盖与结果 |
| --- | --- |
| 错误原因准确，网络失败不写成权限不足 | 九类逐项断言HTTP、code和result；网络/超时不含权限拒绝。另验证HTTP状态与不一致业务码时优先保留HTTP错误类型；浏览器保留“两次网络失败，不能据此判断权限不足” |
| 缺失行情不补零、不随机生成 | 网络/超时responseText=null、item_count=null；空数据item=[]；缺close_price仍缺字段。每个浏览器场景market_bars=[]，没有伪造零收盘价 |
| 不静默切换synthetic | 未点击构造案例自动载入按钮；用户主动选择构造CSV验收入口，交易/事件仍为user_provided/unverified，不变成内置synthetic行情；mock前后浏览器存储原文完全相同 |
| 不生成依赖缺失行情的确定结论 | 浏览器每个场景均断言“尚未生成复盘报告”“尚未生成清单”，行情为空；这证明当前页面无报告，不代表未来报告生成器已实现缺失行情阻断 |
| 已导入交易与用户事件可查看、保存 | 每个场景先导入两笔CSV和原有用户TXT事件，再运行mock，随后追加第二条用户事件、下载备份、刷新恢复；交易ID和原事件保留，全部用户来源仍未验证；无外部浏览器请求、无pageerror |
| CSV闭合交易现金盈亏 | 暂算费用前-100.00元、现金净盈亏-110.00元，页面“仅依据已录入交易暂算”和依赖交易ID可见；只有CSV和用户事件，market_bars为空，因此不是行情接口提供。业务单测验证整数分、数量归零、手续费及公司行动限制 |
| 手续费缺失净盈亏未知 | 每个场景另按现有整批替换规则导入两行fee为空的CSV，fee均null、已知费用小计显示2笔缺失、费用前-100.00元、净盈亏未知且不再显示-110.00；原事件清除是用户确认整批替换，不是故障清空 |

使用DEMO001及明确构造的CSV/TXT作为用户入口验收素材，非私人交易、真实公司新闻或合法历史快照。已知费用小计0不等于总费用为0。闭合过程仍provisional，期初无持仓/无遗漏未确认，不声称完整真实收益。

## 修复及保留记录

- 新增同日期同口径数值冲突分类DATA_SOURCE_CONFLICT；完全一致的重复行仍为schema错误，不误称数值冲突。该码是本地校验结果，不是供应商业务码或新HTTP接口。
- 调整错误优先级，HTTP401/403/429优先于响应内矛盾的业务码；HTTP200继续检查业务code。
- 首次浏览器测试加载报`Cannot use 'import.meta' outside a module`，未开始用例。将可复用校验/单次请求逻辑从CLI提取到`scripts/data-probe.mjs`；CLI继续使用同一配置、一次请求、15秒超时、无自动重试/回退与原记录保存逻辑。测试引入纯模块，生产页面不导入mock。
- 对provider-notes.md、src/lib/data-source-status.ts及本地两份真实summary做前后SHA-256一致性核对：4个文件均未改变。没有创建第三份真实调用记录，不改真实第11节、不读取/修改.env.local、不调用check:data、不修改上传副本。

未验证：真实网络/接口可用性、当前账号权限、真实HTTP/业务响应、合法历史快照、生产部署、供应商页面适配、真实15秒超时、跨快照冲突、独立人工操作、未来模型报告的缺失行情阻断。生产构建本轮未执行（本次仅修改独立脚本/测试及文档，未修改页面）；既有阶段构建结果不作为本轮新构建通过依据。

## 追加：清单与下一次决策实际验证（2026-10-10 17:45:47 +08:00）

此为后续阶段，原11.4记录保持历史。目录D:\AI PM\Projects\investment-review；命令表、首轮失败及修复详见STATUS最新章节。test:learning最终10过/0失败/0跳过、test:review20过/0失败/0跳过、全量test:browser -- --reporter=list,json 31过/0失败/0跳过，全部退出0；来源现金校验加固后test:browser -- tests/browser/learning.spec.ts 6过再次退出0；typecheck/lint/build最终退出0，计数未提供。唯一用例共61通过，不累加重跑。

专项浏览器首次退出1（4过2失败）：标签名称受textarea内容影响、哈希错误断言不匹配中文提示；新增夹具类型检查退出1 TS2589，传JSON字符串后解决。覆盖新增清单选择/编辑/勾选/删除、保存刷新、备份导入/导出、不可变新决策快照、完成/退回规则、错误/容量/不可用/冲突及过期来源沿用。数据与故障仅构造测试。没有check:data、真实模型/供应商请求或本轮独立人工验收/部署，真实状态仍unavailable。
