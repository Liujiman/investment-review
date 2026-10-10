# 项目状态

更新日期：2026-10-10（Asia/Shanghai）。当前阶段：清单候选管理、本地备份及下一次决策记录；真实数据unavailable。最新记录优先，此前阶段记录保留为历史。

## README实际整理与文档检查（2026-10-10 17:53:56 +08:00）

本轮只整理README及登记文档记录，未增加功能或修改现有文件命名。核对源码/Schema、实际按钮、package.json、公开.env.example及已有STATUS/provider记录；纠正旧构造用户入口来源说明，明确缓存查看/人工辅助/自动API差异、辅助流程不需模型Key、真实行情unavailable和两次网络失败不等于无权限。补充Node要求、网址/仓库、CSV与TXT、A/B/清单步骤、时间/现金口径、存储/备份及已知限制。

实际Node/npm版本检查为24.15.0/11.12.1，Next引擎最低20.9.0；未宣称所有较低版本均实测。README的18个本地文件/目录链接全部存在，12个列出的npm脚本全部存在，CSV九字段与模板一致，两项环境变量与.env.example一致；Node文档核对脚本退出0。git check-ignore退出0，确认.env.local及真实响应目录被忽略，未读取本地Key或真实响应。

外部读取工具尝试已记录的GitHub及Vercel地址失败（Cache miss/工具不可访问）；README保留用户提供地址，并明确本轮未验证可访问性、仓库可见性及线上源码版本，不把工具失败写成网站故障或部署失败。没有请求供应商/模型。git diff --check首次提示README末尾多余空行，修正后最终退出0，仅Windows换行提示。

本轮未运行安装、启动、单测、浏览器测试、typecheck、lint、build或npm审计。README中的测试数保留其原实际执行阶段及退出码，不写成文档修改后的重跑结果；用户此前A/B人工结果保留，清单新功能仍未新增人工或部署验收。上传副本未修改。

## 清单与下一次决策实际实现/验证（2026-10-10 17:45:47 +08:00）

执行目录：`D:\AI PM\Projects\investment-review`。沿用原项目及有效B链路，没有新建项目或修改上传副本。读取SPEC/现有契约/存储及当前Next客户端指南。用户此前A/B校验保存和引用人工通过记录保留；不能把此前验收当作本次新功能已人工验收。

新增`src/lib/learning/board.ts`、`src/components/learning-workspace.tsx`和`test:learning`脚本，没有增加依赖或改锁文件。首页第04区支持选择当前报告候选、选择采用条目、用户编辑、人工勾选、增加无来源条目、排序、确认删除及明确保存清单；名称/适用范围/证券/说明和编辑状态保存。学习来源保留独立稳定报告ID（包ID+原JSON的SHA-256）、包/过程/修订/交易/学习/finding ID、原A/B JSON及完整快照；展示证据ID、原记录ID、字段路径和原包修订，保留构造与未核验标签。不回写冻结报告、证据或金额。

下一次决策仅填写理由、反证条件、检查状态/说明和用户证据文本或链接，没有BUY/SELL建议或计划动作。绑定所选已保存清单ID/版本、不可变内容与范围快照；后续模板编辑/删除不改变旧记录。支持保存草稿、完成及显式退回草稿；完成要求理由/反证条件非空、各项已检查且不适用有说明。来源过期/缺失/当前无法核对时须用户明确确认沿用，限制持续保留。

本地键`investment-review:learning-board:v1`独立于交易及复盘。写入后回读一致才报告保存成功；读写不可用、容量不足、冲突或校验失败保留内存草稿和原已保存数据，不盲目覆盖损坏/未读出的记录。最多25份来源、100份模板/每份100项、200份决策，总8MiB。没有云同步；页面明确提示清除站点数据会丢失内容。

导出/导入格式`investment-review-learning-backup-v1`，保留模板、决策、来源快照及编辑/缺失状态；`persistence:unsaved_draft`明确未保存，`warnings`提示缺来源条目，不补造origin。导入经预览和明确确认后整体替换**清单与决策**，不替换交易/证据/A/B存储。严格JSON/Schema/重复键与ID/包哈希/报告引用/冻结A/编辑标记/清单快照版本均校验；额外以原交易确定性重算来源现金指标，拒绝修改金额后重算哈希的伪造备份。详情原记录与交易快照不一致也拒绝。导入不升级来源为verified或当前有效。

实际操作步骤：[manual-learning-guide.md](manual-learning-guide.md)；原手动复盘指南和README同步当前按钮。

| 实际完整命令 | 退出码 | 通过 | 失败 | 跳过 | 范围 |
| --- | --- | --- | --- | --- | --- |
| `npm.cmd run test:learning`（首次及加固后） | 各0 | 首次9，最终10 | 0 | 0 | 清单、来源/现金重算、快照、完成/版本、错误JSON及存储边界 |
| `npm.cmd run test:review` | 0 | 20 | 0 | 0 | 原A/B契约回归；JSON解析仅新增可配置备份上限，模型默认512KiB不变 |
| `npm.cmd run test:browser -- tests/browser/learning.spec.ts`（首次） | 1 | 4 | 2 | 0 | 标签定位和错误提示断言失败 |
| `npm.cmd run test:browser -- tests/browser/learning.spec.ts`（修复后、现金校验加固后） | 各0 | 每次6 | 0 | 0 | 新流程完整操作、存储/导入失败、过期和冲突 |
| `npm.cmd run test:browser -- --reporter=list,json` | 0 | 31 | 0 | 0 | 全量25项既有与6项新增；之后现金校验加固又重跑受影响6项 |
| `npm.cmd run typecheck`（新增浏览器夹具后） | 1 | 未提供 | 未提供 | 未提供 | TS2589：Playwright参数递归类型展开过深 |
| `npm.cmd run typecheck`（最终） | 0 | 未提供 | 未提供 | 未提供 | 传递已序列化构造JSON字符串后通过 |
| `npm.cmd run lint`（最终） | 0 | 未提供 | 未提供 | 未提供 | 通过，无警告 |
| `npm.cmd run build`（最终） | 0 | 未提供 | 未提供 | 未提供 | Next16.4编译、类型及静态首页生成通过 |

全量浏览器前设置`$env:PLAYWRIGHT_JSON_OUTPUT_FILE='test-results/learning-browser-report.json'`。报告开始2026-10-10T09:40:04.175Z（上海17:40:04），expected=31、unexpected=0、skipped=0、flaky=0、errors=[]，59.9秒。最终唯一测试合计61通过/0失败/0跳过，不累加重跑数量。测试产物被Git忽略。

`tests/learning.test.ts`10项实际通过：候选编辑/勾选/来源不可变；模板改删不改决策快照；完成规则和退回草稿；过期/缺来源沿用；完整导出/导入；JSON/ID/哈希/编辑状态/快照拒绝；无来源显式保留；重算哈希仍不能覆盖程序金额；不可用/容量/回读/冲突；超限。`tests/browser/learning.spec.ts`6项实际通过：候选选改勾删/保存刷新/新决策完成退回/旧版本；导出和UTF-8上传恢复及非法输入不覆盖；容量失败草稿导出与导入失败保护；不可用存储不假保存；理由变更使来源过期、须确认且保留旧快照；模拟跨标签事件暂停保存。全链路浏览器用例检查无外部请求或pageerror。

修复：给表单控件稳定的可访问名称，避免textarea内容参与标签造成定位失败；哈希断言对齐实际中文错误；Playwright夹具改传JSON字符串避免TS递归展开；上传失败先清除旧预览；导出缺来源warnings及紧凑JSON容量回退；校验用户编辑标记、原交易/指标快照一致性及确定性现金值。没有因测试失败削弱保存/来源校验。

未执行/边界：本轮未运行test:domain、test:data-check或check:data，未请求真实行情/模型或读取Key；真实行情仍unavailable、两次网络失败不代表权限不足。没有新增生产mock开关、云同步、全项目格式迁移、自动备份合并、生产部署或独立人工验收；新功能人工验收待用户实际操作。源文本真实性/许可/语义支持仍需人工核验，导入包哈希不是来源真实性证明。localStorage无数据库事务；同浏览器不同网站地址不共享数据。旧报告认可/不认可状态按钮仍未实现。

## 用户手动辅助A/B执行记录（更新于2026-10-10 17:24:25 +08:00）

记录依据：用户确认已执行辅助A/B流程，提供A/B输出JSON及模型名称，并明确确认A/B校验与保存结果。用户人工检查确认：能打开对应记录；ID和版本正确；原文或字段支持结论；来源和未核验标签保留；本次未发现问题。此为用户实际操作反馈，不是本轮Codex自动化验证。记录时间为文档更新时刻，不是用户操作发生时间。

| 项目 | 本次实际记录 |
| --- | --- |
| 辅助A/B流程执行 | 用户自述已执行；具体执行时间、所用案例与部署版本未提供 |
| 阶段A校验与保存 | 已确认（用户实际操作反馈）：校验通过并保存。已提供prior_assessment输出；输出表示没有可引用事前证据，不作实质判断 |
| 阶段B校验与保存 | 已确认（用户实际操作反馈）：校验通过并保存。已提供outcome_review输出，含2条事实发现、6条不确定性、4条学习问题候选，解释/行为假设均为空 |
| 引用人工检查 | 通过（用户人工确认）：对应记录可打开，ID和版本正确，原文或字段支持结论，来源及未核验标签保留 |
| 发现的问题 | 本次人工检查未发现问题（用户反馈；限本次检查范围） |
| GPT实际模型 | 用户填写：GPT-6.1SOL；按原文记录，未独立核验界面或自动推断API模型ID |

输出标识：A包`A-8247b4d1-14f7-4e81-a0b2-51c4b2614523`；B包`B-31393644-9140-441c-95ab-7cc34ea3cad7`。两份输出均填写过程`episode-dd53c8ad-7a0f-4b7b-bdc9-ebd6d97d7c70`、修订20、决策`e9099c4c-e972-476b-ad34-9c83b0ed50a9`。这只是用户提供输出的标识一致性记录，不证明它们匹配真实保存的输入包、哈希或冻结A。

输出保留构造/未核验/unavailable及现金暂算限制，没有新增金额值，也未以亏损认定决策好坏或心理偏差。用户已人工检查引用可打开、ID/版本及原文或字段支持关系，反馈未发现问题。此前完整性相关措辞的待检查提示不记为已发现故障。Codex本轮未取得输入快照，未重新执行逐决策usage、输入哈希或冻结绑定校验；人工检查通过不升级资料为verified，也不证明真实行情、历史版本真实性或完整投资收益已独立核验。

自动API尚未接入；本次记录用户确认的手动A/B校验与保存及人工引用检查，不记录为站内自动调用成功。真实行情继续unavailable，两次既有网络失败不改为权限不足。本次仅更新文档，未重新执行单测、浏览器测试、类型检查或构建，未调用模型或供应商接口。此前“校验与保存未确认”已由本次用户明确确认更新，不再作为当前状态。

## 手动辅助A/B链路实际检查（2026-10-10 16:43:51 +08:00）

执行目录：`D:\AI PM\Projects\investment-review`。沿用`docs/ai-contract.md`及既有字段、时间分类、持仓和整数分计算，未修改上传副本。实际按钮/复制/粘贴操作见`docs/manual-review-guide.md`。

新增`src/lib/review/`契约Schema、固定规则、严格JSON/Schema/引用校验、任务包及独立保存；`src/components/manual-review.tsx`接入首页；新增test:review脚本，没有新增依赖。用户确认零期初持仓、交易完整、无公司行动及资料归属后生成任务，未清仓/未确认则阻止。事件和行情显式选择，理由按关联交易归属。

A任务包含完整固定A规则、可达A_output Schema和过滤后的A_input，不含未来交易、最终盈亏、事后/未知/回忆原文、隐藏Dataset或B定义；当前交易仅传ID/方向/证券/截止边界。B只能在当前有效冻结A后生成，绑定原A JSON和输入快照。保留构造、未核验、回忆、缺失及unavailable，程序金额不可被模型字段覆盖，缺费总费/净值为null。金额依旧是录入交易现金暂算，不是供应商收益。

非法JSON、未知字段、错绑定/阶段、不存在ID、非法Pointer/usage、越阶段引用、未知指标支持和模型金额字段明确拒绝；无自动修复或默认成功。A同包只冻结一次。独立过程ID、修订号、SHA-256、原始JSON及快照保留。新增/修改理由、交易或证据保守使相关结果过期并重置确认；切换决策不能沿用别的决策结果，重建A使旧B失效。原字段未保存、复盘保存失败或跨标签冲突不假成功。报告和学习问题均是待核验候选。

| 实际完整命令 | 退出码 | 通过 | 失败 | 跳过 | 结果 |
| --- | --- | --- | --- | --- | --- |
| `npm.cmd run test:domain` | 0 | 35 | 0 | 0 | 原导入/时间/持仓/现金回归通过 |
| `npm.cmd run test:review`（修复后及最后加固后） | 各0 | 每次20 | 0 | 0 | 新契约边界测试通过 |
| `npm.cmd run test:browser -- --reporter=list,json`（修复后及最后加固后） | 各0 | 每次25 | 0 | 0 | 原21项及新4项通过 |
| `npm.cmd run typecheck`（最终） | 0 | 未提供 | 未提供 | 未提供 | 通过 |
| `npm.cmd run lint`（最终） | 0 | 未提供 | 未提供 | 未提供 | 通过，无警告 |
| `npm.cmd run build`（最终） | 0 | 未提供 | 未提供 | 未提供 | 编译/类型/静态生成通过 |

浏览器命令前设置`$env:PLAYWRIGHT_JSON_OUTPUT_FILE='test-results/review-browser-report.json'`；最后报告expected=25、unexpected=0、skipped=0、flaky=0、errors=[]，开始2026-10-10T08:40:40.713Z（上海16:40:40），耗时46.2秒。本次唯一用例合计80通过、0失败、0跳过，不累加重复运行。

`tests/review.test.ts`20项覆盖：三条事前快照/任务阶段裁剪、门控、同日日期/日线/回忆排除、冻结/包绑定、金额/缺费/unavailable、非法JSON/字段/ID/Pointer/越阶段引用、模型金额拒绝、学习关联、理由/交易/证据/决策变更、哈希及保存冲突。`tests/browser/manual-review.spec.ts`4项覆盖实际复制→粘贴A冻结→B报告→候选下载/刷新，无外部请求；非法输入保留原结果；理由变更立即过期；复盘存储失败不冻结。浏览器JSON是构造测试夹具，不是实际模型响应。

首轮失败及修复：review单测退出1（18通过、2失败），修正将规则中的created_at说明误当输入泄漏的断言，以及空理由夹具未清空active_reason_id；专项浏览器退出1（3通过、1失败），修正Windows剪贴板CRLF断言，仅归一换行仍核对完整内容。typecheck先后退出1，修正阶段联合类型、旧结果数组收窄及夹具Binding类型；lint首轮退出1，修正渲染ref访问、effect清理与未用变量。后续受影响检查全部通过。另加固原字段保存状态检查、快照ID长度、Pointer自有属性及JSON深度限制。

未验证/未实现：没有调用模型或真实供应商，没有运行check:data/test:data-check或读取/输出Key；真实行情仍unavailable，既有两次网络失败不解释为权限不足。自然语言真实性、完整语义及历史版本声明仍需人工核验，规则校验不保证模型正确。学习问题候选编辑仅内存，下载不改变冻结B；正式模板保存/下一决策绑定、报告认可状态按钮、通用备份恢复、PDF/OCR/爬虫/行情快照上传及部署未实现或未验证。过期快照不自动恢复为有效结果。

## 第11.4步数据失败状态实际验收（2026-10-10 15:47:44 +08:00）

真实行情仍unavailable。未运行check:data，未读取/修改本地Key、改变账号权限或请求供应商；两次既有网络失败不改成权限不足。provider-notes、页面真实状态常量、两份本地真实失败summary的前后SHA-256一致，未生成新的真实记录。模拟权限拒绝不是当前账号权限结论。

新增tests/fixtures/data-failures.mjs和tests/browser/data-failures.spec.ts，mock仅供测试。九类网络/超时/鉴权/权限/429/空数据/HTTP200业务失败/缺字段/同口径冲突均通过。完善独立探测校验：同日期不同数值明确DATA_SOURCE_CONFLICT；不一致业务码不覆盖HTTP401/403/429。提取scripts/data-probe.mjs以便测试运行器复用，保留CLI请求/配置/保存方式，页面无mock开关、无供应商适配层。

实际目录D:\AI PM\Projects\investment-review。npm.cmd run test:data-check两次均退出0、19过/0失败/0跳过；test:domain退出0、35过/0失败/0跳过；test:browser -- --reporter=list,json --output=test-results/data-failure首次退出1（import.meta模块加载错误，0用例执行），修复后退出0、21过/0失败/0跳过，JSON输出test-results/data-failure-report.json。typecheck和lint各执行两次，均退出0；本轮未执行build。完整命令、模拟矩阵和范围见test-report.md。

浏览器九个新场景分别验证已导入CSV和用户事件原文不被mock影响，失败后可继续新增事件、下载备份、刷新恢复，无外部请求/pageerror，market_bars持续为空，不自动加载synthetic行情；现金依录入CSV暂算-100费用前/-110净值，缺两笔费用后净值未知，报告/清单仍未生成。

边界：mock在Node测试进程执行，页面仍是既有unavailable工作台；这不是页面九类错误提示联动验收，适配层未实现。真实权限/网络/响应、跨快照冲突、真实15秒超时、独立人工操作、未来报告生成器缺行情拦截均未验证。人工说明已补充此范围并保持人工记录未执行，上传副本未同步。

## 第11.3—11.5步材料准备与实际检查（2026-10-10 15:05:55 +08:00）

执行目录：`D:\AI PM\Projects\investment-review`。读取现有CSV、事件入口、四类schema、SPEC、STATUS、AGENTS及当前Next客户端指南。新增`docs/acceptance-fixtures/`下2份CSV与3份UTF-8事件TXT，新增`docs/manual-acceptance-11.md`，列出真实入口、按钮、逐字段值、替换顺序及预期结果。CSV为3月10日买入、3月12日卖出，和内置3月3日案例分开，不修改固定案例。

修正现有构造模式用户入口来源标签：用户CSV/理由/事件现在均保留user_provided/unverified，并明确is_constructed=true；内置固定案例仍是synthetic。共享schema兼容旧固定素材和旧浏览器记录；构造用户记录不能混成provider_api/verified。页面预览、模式说明、详情显示来源与构造属性的区别。没有更改时间、持仓或金额算法。

| 实际完整命令 | 退出码 | 真实结果 |
| --- | --- | --- |
| `npm.cmd run test:domain` | 0 | 35通过、0失败、0跳过；含实际验收附件的2项新增测试 |
| `npm.cmd run test:browser`（首次、最终复查） | 各0 | 每次12通过；控制台未单列失败/跳过数量；新用例走实际CSV/TXT入口且没有外部请求 |
| `npm.cmd run typecheck`（首次） | 1 | 新浏览器测试回调参数event缺少类型，TS7006 |
| `npm.cmd run typecheck`（修复后及最终复查） | 各0 | 为保存数据声明Dataset类型后通过 |
| `npm.cmd run lint`（首次、最终复查） | 各0 | 通过，无lint警告 |
| `npm.cmd run build`（首次、最终界面文案调整后） | 各0 | 编译/TypeScript/静态页面生成通过 |

`tests/domain.test.ts`新增验收CSV用例验证两日期/来源/构造标记、持仓归零、买入1000元/卖出900元/费10元/费用前-100元/净-110元暂算；缺费用例验证两笔fee=null、总费与净盈亏null。TXT用例用实际附件解码并验证1事前/3事后/1未知，同日仅日期不补时刻、录入与取数时间不替代公开时间、历史版本未确认不进入事前、构造来源不能升级verified或冒充provider_api。`tests/browser/import.spec.ts`新增实际上传/保存/详情/筛选/刷新/替换缺费的完整入口用例。

辅助执行中两次读取用了不存在的大小写/连字符文件名，一次读取不存在的cash.ts，随后通过rg定位实际文件；尝试用python进行批量文本替换时系统无python（退出1），该命令未修改文件，改用现有node完成。以上不是测试通过。首次typecheck失败已如实记录并修复；其余业务检查无失败。

未验证/未实现：人工验收仍未执行，说明中的表格待实际操作人填写；SPEC11.3完整报告结论引用、11.4报告引用快照及旧报告回溯均未实现（SPEC没有11.5标题，本次编号按用户任务组织）。真实行情仍unavailable，两次网络失败不改为权限不足，没有运行check:data或调用行情/收费模型；真实数据可用性与权限、资料许可/真实性独立核验未验证。PDF/OCR、爬虫、行情快照上传、报告/清单生成、完整持仓确认及通用备份恢复未实现；上传副本未同步。

## unavailable与证据入口实际结果（2026-10-10 11:50 +08:00）

用户确认真实权限仍未取得，本阶段保留显式unavailable。新增`src/lib/data-source-status.ts`及首页状态说明：已有两次A股历史日线尝试，均网络失败，无HTTP/code/响应，不能判定账号被拒绝；没有可用真实快照。此为用户指令下的产品状态，不是实时权限探测；演示/用户上传不会自动改成成功。

| 能力 | 实际状态与证据 |
| --- | --- |
| A股历史日线 `GET /api/a-share/prices/historical` | 2026-10-10上海09:20:29、09:21:14两次单次尝试，600519.SH/1d/none，2026-09-01至09-25；本地两份summary均DATA_SOURCE_NETWORK_ERROR。请求条数未知，无response文件；标的/日期响应匹配未验证 |
| 合法真实历史快照 | 未发现可用快照及许可依据；DEMO001不能算真实快照 |
| 固定构造演示 | 已有完整9条证据，全部synthetic，入口说明区分完整案例和仅交易CSV，不作为供应商成功依据 |
| 用户交易CSV与理由 | 已实现预览/确认/本地保存；真实模式是user_provided，构造模式是synthetic，未自动核验真实性 |
| 用户事件证据TXT/粘贴 | 本阶段新增，来源/原文/发布时间精度/版本声明保留；真实模式user_provided/unverified，构造模式synthetic，不生成provider_api |
| 检索、指数、日历、公司行动及自动新闻接口 | 未尝试且未接入，不能推断可用或无权限；新闻附件另有端外限制 |

新增`src/lib/domain/events.ts`、`src/components/event-input.tsx`：选择当前证券，上传UTF-8 TXT或粘贴原文，必填标题/摘录/来源；未知时间留空，文件读取/录入时间不替代公开时间，fetched_at=null；历史版本不确认则排除事前。TXT最大64KiB、摘录1–2000字符，非法编码/类型/大小拒绝，不自动截断。资料只进浏览器本地，失败沿用备份/冲突保护，不访问来源链接或模型。已有记录与固定素材不覆盖，事件新增不随机生成内容。

实际命令与结果：`npm.cmd run test:domain`退出0，33通过/0失败/0跳过；`npm.cmd run test:browser`退出0，11通过；`npm.cmd run typecheck`、`npm.cmd run lint`、一次`npm.cmd run build`均退出0，未发现本阶段检查失败。新增三项单测及一项浏览器验证覆盖上传原文/未知时间/仅日期/版本、来源标签/刷新恢复、类型/编码/长度拒绝；浏览器确认没有外部请求、pageerror及虚假可用状态。

未实现：PDF/图片/OCR、网页抓取、用户行情快照导入与许可核验、供应商页面适配、自动新闻、模型/证据包/报告/清单、完整性/Episode修订/迁移及完整备份恢复。没有新增端点，没有运行check:data或改动第11节及原失败摘要，没有真实行情/模型请求，没有输出密钥；上传副本未同步。

## 第10.6步：本次实际执行检查（2026-10-10）

执行目录：`D:\AI PM\Projects\investment-review`。本次重新实际执行，不沿用上一轮通过结论。核对完成时间：2026-10-10 11:28:42 +08:00；浏览器报告开始时间为03:28:01 UTC（上海11:28:01）。

先读取`package.json`确认现有命令：业务测试`tsx --test tests/domain.test.ts tests/analysis.test.ts`，浏览器测试`playwright test`，类型检查`next typegen && tsc --noEmit`，lint为`eslint . --max-warnings=0`，生产构建`next build`。本次检查范围按用户明确列出的六类行为执行；本地SPEC的10.6标题为设置页，本记录不宣称完成设置页/备份恢复验收。

| 实际完整检查命令（PowerShell） | 退出码 | 状态 | 测试通过 | 测试失败 | 测试跳过 |
| --- | --- | --- | --- | --- | --- |
| `npm.cmd run test:domain` | 0 | 通过 | 30 | 0 | 0 |
| `npm.cmd run test:browser -- --reporter=list,json` | 0 | 通过 | 10 | 0 | 0 |
| `npm.cmd run typecheck` | 0 | 通过 | 未提供 | 未提供 | 未提供 |
| `npm.cmd run lint` | 0 | 通过 | 未提供 | 未提供 | 未提供 |
| `npm.cmd run build` | 0 | 通过 | 未提供 | 未提供 | 未提供 |

浏览器命令运行前在该PowerShell进程设置：

```powershell
$env:PLAYWRIGHT_JSON_OUTPUT_NAME = 'playwright-report/step-10-6-results.json'
npm.cmd run test:browser -- --reporter=list,json
exit $LASTEXITCODE
```

报告实际保存于`playwright-report/step-10-6-results.json`（忽略的本地产物，不上传）。核对stats：expected=10、unexpected=0、skipped=0、flaky=0，报告级errors=0；CLI显示10 passed。Node单测明确提供tests=30、pass=30、fail=0、skipped=0、cancelled=0、todo=0。两类测试合计40通过、0失败、0跳过。类型/lint/build不是测试计数工具，因此数量写“未提供”，不虚构通过条数。

### 六项行为覆盖及本次结果

| 用户要求 | 对应测试文件/用例 | 本次实际结果 |
| --- | --- | --- |
| 事前、事后、时间未知分类 | `tests/analysis.test.ts:112` — `fixed first-buy visibility is 3 prior, 5 post, 1 unknown; decision switch recomputes`；`tests/browser/import.spec.ts:126` — `decision filtering recalculates visibility and excludes future results from prior view` | 通过；首次买入3/5/1，切换交易重新分类，prior视图不展示未来结果 |
| 当日收盘价不作盘中已知 | `tests/analysis.test.ts:169` — `same-day full daily bars cannot become prior even with premature availability or evening decisions`；上述browser:126 | 通过；当日完整日线即使误填过早可得时间也不进prior，浏览器事前范围只显示前日日线 |
| 同日缺少发布时间不能直接事前 | `tests/analysis.test.ts:124` — `strict equality is post; Shanghai offset comparisons and date intervals never invent an hour`；`:159` — `date-only decision uses conservative midnight, confirmed execution order is not a known hour` | 通过；同日日期区间跨盘中边界为unknown，日期精度决策采用保守零点，不补造小时 |
| 完整买入到清仓的数量/金额/手续费 | `tests/analysis.test.ts:18` — `sort by time, split zero-to-zero processes, and preserve original array`；`:72` — `fixed case cash uses integer cents and exact actual fees, with stable dependencies`；`tests/domain.test.ts:21` — `fixed full fixture exactly matches requested two-trade case and all records are synthetic` | 通过；买卖各100股/归零，买入1000元、卖出900元、费用10元、费用前-100元/净-110元，暂算状态可见 |
| 缺手续费不补零/不声称准确净收益 | `tests/analysis.test.ts:82` — `missing fees hide only net metrics; explicit zero is known; no unrealized liquidation for open positions`；`tests/browser/import.spec.ts:146` — `corporate action restriction blocks simplified profits and unknown fees only show gross` | 通过；null与明确0分开，净盈亏/总费用未知，保留已知费用小计及费用前盈亏，页面有未知原因 |
| 不完整/不支持过程提示且不强行出结果 | `tests/analysis.test.ts:40` — `reject first sell and oversell without using later buys to repair; suppress broken symbol metrics`；`:93` — `known corporate actions block simplified P&L; unknown completeness remains provisional`；`tests/browser/import.spec.ts:170` — `first sell and oversell block adoption without overwriting case; open buy never pretends liquidation`；browser:146 | 通过；先卖/超卖阻止采用并保留当前数据，open不出完整盈亏，复杂公司行动阻止简化盈亏 |

补充的既有用例也实际执行：首次可得时间不由取数/发生/管理时间代替、历史文本版本/冲突、回忆及后续交易理由排除、整数精度/汇总舍入、导入/本地存储/双标签页和窄屏等。

修复情况：本次所有检查首次执行均退出0，无需修复业务/测试/配置，也无覆盖缺失需要新增用例；仅新增此实际验证记录及本地测试产物。前文上一轮alert定位失败属于历史记录，不计为本次失败。Chrome输出NO_COLOR/FORCE_COLOR提示，不影响退出码；生产构建成功生成首页和404。

仍未验证：真实供应商鉴权/行情许可及真实响应、收费或其他模型API、Vercel部署与线上行为、券商账单对账、复杂公司行动完整核算、历史新闻原文/版本的独立真实性核验。正式Episode修订/完整性确认、完整备份恢复、证据包/报告/清单等未实现功能不纳入通过范围；本页公司行动选择未持久化，闭合金额仍为暂算。

本次没有执行`check:data`或`test:data-check`：前者会访问真实供应商，按用户要求不调用；后者是无关供应商脚本离线测试，不属于本次计算检查。没有任何本次必需检查因环境问题无法执行。未请求AI/真实行情、不输出密钥、不修改上传副本；真实接口与部署均不得因本地检查通过标为通过。

## 持仓与时间计算实际结果（2026-10-10）

- 在原项目开发，未更新上传副本。按证券/模式和确认的成交顺序，从零到零识别闭合过程，未归零标open；先卖、超卖、顺序未确认或矛盾阻止识别。CSV预览保留原记录和阻塞原因，采用前拒绝先卖/超卖，不使用后续买入修补错误。
- 时间线新增决策交易及可见范围选择，程序按首次可得时间计算prior/post/unknown。相等不是事前，日期区间跨边界未知；仅日期交易保守使用上海00:00边界。取数、发生和管理时间不替代公开时间；未核实历史文本版本/已知冲突排除事前；回忆不当作当时依据，当前成交结果和同日完整日线不进入事前。
- 固定两笔案例识别一个闭合过程，费用前-100.00元、实际费用合计10.00元、现金净盈亏-110.00元；首次买入分类为事前3、事后5、未知1。切换清仓交易后为事前7、事后2、未知0。
- 金额用BigInt整数处理、最终返回整数分，原始小数精度保留至累计/差额完成再四舍五入，不用浮点。缺费仅显示费用前盈亏，净值未知；未清仓只显示交易额、费用与股数。复杂分红/拆股等存在时阻止简化盈亏；公司行动未知标待确认。
- 页面显示计算公式、交易/证据依赖和口径限制。所有闭合金额仍为仅依据已录入交易的暂算：期初持仓和遗漏未确认。公司行动选择仅本页临时保留，不写入旧存储；正式Episode保存/版本/完整性确认与报告包仍未实现。事前筛选不显示全程盈亏，AI复盘与学习清单仍未生成。

实际验证：`npm.cmd run test:domain`通过30项（原14项+新增16项）；`npm.cmd run test:browser`通过10项；typecheck、lint通过；执行一次生产build通过。浏览器首轮9通过/1失败，原因是新断言同时匹配业务警告和Next路由播报器两个alert；定位具体阻塞文字后最终10项通过。增加公司行动限制跨筛选保留测试。以上是开发自动化结果，不追加用户人工验收。

新增`positions.ts`、`visibility.ts`、`position-summary.tsx`、`tests/analysis.test.ts`，调整CSV采用/预览、时间线/详情、理由提示、首页和业务测试命令；存储schema和固定素材不变。不调用真实行情/模型、不输出密钥、不更新provider notes第11节，不改上传副本；未重跑无关数据核查脚本测试。

## 四区交互实际结果（2026-10-10）

- 导入区保留已验收的示例、CSV预览/整批确认，新增关联交易的理由表单。可填写当时记录/事后回忆、判断、预期证据、失效条件、原始摘录、来源名称/链接、历史形成时间与精度/版本确认。仅保存用户输入；未知时间不补造，当前录入时间不充当历史时间。新增理由保留原有记录，写入成功才显示已保存；理由版本选择移到导入区。
- 时间线区汇总全部交易、理由、事件和行情，按已有记录日期分组；完整固定案例为9条，加入1份用户理由后为10条。每条证据的时间分类均标记“待计算”，同日排列只表示展示顺序，不宣称事前/事后或实际先后；缺少日期的理由进入未提供日期区。
- 统一“查看来源详情”入口：显示保存的原始摘录、字段/采用值、证据ID、来源类型/名称/定位/链接、来源字段、单位、独立首次发布时间或未提供状态、首次可得时间/精度/依据、取数时间、上海时区、质量与synthetic标签。事件发布时间不与取数时间混用；其他记录没有独立公开时间时不补造。用户理由输入没有供应商取数时保持fetched_at=null。
- 复盘区明确显示“尚未生成复盘报告”；清单区明确显示“尚未生成清单”。没有成功报告、自动建议或虚构的可用按钮。

新增 `src/lib/domain/reasons.ts`、`timeline.ts` 和 `src/components/reason-input.tsx`、`evidence-details.tsx`、`evidence-timeline.tsx`，调整已有工作台/首页，沿用已有schema和存储协议，不修改固定素材或环境变量。ESLint新增测试产物和本地响应目录忽略，业务源文件与测试仍检查。

本阶段实际检查：typecheck通过、lint通过、14项业务单元测试通过、7项Chrome浏览器测试通过，按要求执行一次build并通过，`git diff --check`通过。浏览器新增验证理由保存/刷新/原文保留、9条统一证据、日期精度/取数时间详情、四区未生成状态；既有导入/配额失败/双标签页/窄屏测试仍通过。首轮旧日期断言匹配多个元素，修改为精确正文定位；lint因并行浏览器测试重建test-results目录报ENOENT，补充产物忽略后重跑通过。这些失败不能记为首次通过。

本阶段未请求真实行情或模型，未生成报告；未修改provider notes第11节。时间分类、冲突检测、收益计算、既有理由编辑、报告与清单生成仍未实现。上述为开发自动化验证，不追加新的用户人工验收结论。

## 导入人工验收（2026-10-10）

用户在当前会话明确确认“当前导入验收通过”，并要求登记正常导入、负数量拒绝和费用缺失的实际结果。以下为用户确认的验收记录，与下方此前自动化测试分开；未补造浏览器版本、操作时间或截图。

| 场景 | 结果 | 实际行为 |
| --- | --- | --- |
| 正常导入 | 通过 | 正常构造CSV可完成预览、确认整批导入，显示两笔交易及保存状态 |
| 负数量拒绝 | 通过 | 负数量案例显示quantity字段错误并阻止整批导入，不采用错误交易 |
| 费用缺失 | 通过 | 费用缺失案例提示警告并允许导入，缺失费用保留为未知/null，不补零或推算费用 |

该次验收登记只更新STATUS和AI使用日志，没有新增功能、修改业务代码或重新运行测试。此前测试结果保留为原执行记录；人工验收范围仅限上述导入场景，不扩大到收益计算、AI报告或真实接口。

## 已实现

- 在现有 `investment-review` 项目上继续，保留中文根布局、系统字体和既有用户修改。
- 新增 `src/lib/domain/schema.ts`：交易、理由、事件、日线四类严格 Zod schema；类型从 schema 派生，未知字段拒绝。共享 evidence 保留证据ID、source_type、来源名称/位置/字段、单位、上海时区、首次可得日期/时刻与精度/依据、取数时间和质量状态/说明。日期精度不补小时，首次可得时间不使用导入/取数时间冒充；供应商日线缺少首次公开依据时必须保留未知。
- 新增固定案例 `public/samples/demo-case.json`：稳定 ID、固定时间与数值，全部 synthetic；两笔交易为3月3日10:00买入100股10元费用5元、3月10日14:00卖出100股9元费用5元。三条事件包含买入前、同日18:00和同日仅日期；两条日线包含前日与买入日18:00才可得；两份理由为当时日记与清仓后回忆。切换不覆盖原文。
- 标准 CSV、负数量、费用缺失和空模板四份 CSV 可下载；完整构造 JSON 可下载复用。`scripts/generate-demo.mjs` 可按固定规则重建，不使用随机数。
- 新增 `src/lib/import/csv.ts`：使用 csv-parse 库，UTF-8/BOM、引号/逗号/换行、原起始行号、九字段表头、2MB/5000条上限、日期/时间/数量/十进制校验；负数量阻止整批导入，费用缺失保持null；真实/构造入口分开。疑似重复逐组确认保留或明确排除，同日顺序不明需确认；顺序与精确时刻矛盾时拒绝。
- 新增客户端 `src/components/import-workspace.tsx`：上传预览→确认整批导入、一键载入、四类字段与证据查看、理由版本切换。已有数据时确认整体替换，不自动合并历史持仓。未实现功能继续明确标注。
- 新增 `src/lib/storage/dataset-store.ts`：4MB限制、schema恢复校验、本地写入后才显示已保存、失败保留内存及下载、跨标签页冲突暂停写入；可用时使用浏览器锁。阶段数据键 `investment-review:fields-import:v1`，不覆盖 SPEC 最终根对象键。

## 规格差异与边界

本阶段用户明确指定两笔交易和每笔费用5元，优先于 SPEC 原第14节四笔交易/费用案例；保留 SPEC 原文，后续验收不能继续套用原四笔案例预期。买入前日2025-03-02是周日；按用户指令保留为纯构造日线，不能解释为真实A股交易日。synthetic是来源类型，data_mode保留SPEC的constructed枚举。

当前提供导入、理由/事件证据新增、持仓派生识别、现金暂算及时间分类；行情图、证据包、AI JSON校验、报告或学习清单仍未实现。CSV只导入用户提供的交易，不补造其他三类记录；事件需用户上传/输入。既有理由/事件自由编辑、通用JSON恢复与坏数据原文导出界面仍未实现。阶段schema尚不是SPEC的完整Episode/报告/备份根协议，后续需明确迁移，不能静默覆盖已有格式。

## 工程与实际验证

新增生产依赖 Zod 4.6.5、csv-parse 7.0.3；新增开发依赖 tsx 4.23.15、@playwright/test 1.64.0；更新package-lock。保留Next.js16.4.0、React19.3.0。TS target调整为ES2020以使用BigInt十进制定点比较；本阶段未做收益计算。

| 检查 | 结果 | 说明 |
| --- | --- | --- |
| `npm.cmd run typecheck` | 通过 | 路由类型生成与严格TS检查 |
| `npm.cmd run lint` | 通过 | 曾发现effect清理中的ref警告并修正；另一次并行检查返回1且无诊断，单独重跑退出0 |
| `npm.cmd run build` | 通过 | 编译、类型检查、静态首页生成成功 |
| `npm.cmd run test:domain` | 通过 | 11项：固定素材、四schema、时间精度、CSV边界、模式分离、负数量/费用未知、重复/顺序、保存与失败保护 |
| `npm.cmd run test:data-check` | 通过 | 9项既有数据核查离线测试，未访问真实接口 |
| `npm.cmd run test:browser` | 通过 | 5项真实Chrome：载入/切换/刷新、负数量保留已有数据、费用未知、真实入口拒绝DEMO001、写入失败下载、双标签页暂停、模板下载与390px页面无全局横向溢出；测试中无外部请求和阻塞性页面异常 |
| Git私有路径忽略 | 通过 | `.env.local`、真实响应目录和测试产物被忽略 |
| `git diff --check` | 通过 | 仅Windows换行转换提示 |
| 完整npm审计 | 失败 / 待处理 | 5项high告警，来自既有eslint-config-next→fast-glob→micromatch→braces开发工具链；审计建议降级到14.x，未自动降级现有16.4.0配置 |
| `npm.cmd audit --omit=dev` | 通过 | 生产依赖0条已知审计告警；不等于绝对无风险 |
| 扶摇/iFinD、真实模型、部署 | 未验证 | 本阶段未请求、未调用、未部署 |

最初尝试另开3100开发服务被现有Next开发锁阻止，改为复用本项目3000服务完成浏览器验证；未终止用户服务。没有读取或输出本地密钥，没有运行真实check:data，provider notes第11节未写入虚假调用结果。

## 应看到的页面

运行 `npm.cmd run dev`，打开终端实际地址。导入区保留下载、分模式上传、本地保存和理由输入，新增持仓阻塞检查。时间线默认展示全部记录，选择决策及分类筛选；载入固定案例看到一个闭合过程、-100元费用前/-110元净暂算值，首次买入下3/5/1分类。每条可展开来源及分类依据，同日仅日期事件为未知、当日日线与回忆为事后。所有构造内容标synthetic；复盘和清单仍未生成。

## 下一阶段

建立正式Episode保存/修订与完整性确认，补充收益率等指标；将阶段格式迁移到完整协议时保持原证据ID和来源，不抹除本地内容。之后实现严格时间过滤的证据包和手动AI JSON导入，真实模型仍需独立授权。真实数据验证脚本存在不等于页面已接入供应商。上传副本是此前快照，不包含本次新功能，发布前需另行重新准备。

## 第 9 步：页面操作骨架与首次部署

### 项目地址

- GitHub 仓库地址：https://github.com/Liujiman/investment-review
- 首次网站地址：https://investment-review-mauve.vercel.app/

### 当前完成情况

- 已完成 CSV 导入功能和页面操作骨架。
- 已将项目源码上传至 GitHub。
- 已通过 Vercel 完成首次部署，网站可以访问。

### 尚未完成

- 时间规则：尚未完成事前可知、事后信息和时间未知的分类与验证。
- AI 复盘：尚未完成复盘生成、证据引用与输出校验。

### 下一步

- 进入第 10 步，实现并验证时间规则与基础计算。

