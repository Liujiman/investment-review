# 两阶段复盘契约设计：当前实现输入摘要

整理日期：2026-10-10（Asia/Shanghai）。用途：供GPT设计契约；本文件只整理当前实现和SPEC差距，不代表已经生成正式证据包、报告或模型结果。未修改功能，未调用模型/供应商，不包含Key、私人交易或账户材料。

权威来源：`docs/SPEC.md`第6、11、12、15节；`src/lib/domain/schema.ts`、`visibility.ts`、`timeline.ts`、`positions.ts`；`src/lib/import/csv.ts`、`events.ts`、`reasons.ts`；`src/lib/storage/dataset-store.ts`、`src/lib/data-source-status.ts`；最新`docs/STATUS.md`。字段以代码为准，SPEC中的尚未实现项单独列出。

## 1. 已实现与未实现

已实现：CSV校验/确认/整批替换、理由和TXT事件录入、本地保存、四类记录schema、相对选定交易的时间分类、持仓过程识别、整数现金计算、来源详情、unavailable状态。

未实现：正式A/B证据包及其严格schema、规范化哈希、不可变证据快照、完整Episode及修订协议、期初无持仓/无遗漏的持久化确认、模型输出schema/导入与引用校验、模型调用、报告、学习清单、完整备份恢复。页面筛选不是证据包导出器；原Dataset、下载备份或完整时间线不能直接作为A输入。

## 2. 当前存储根对象、ID与版本

| 字段 | 实际类型/含义 |
| --- | --- |
| schema_version | 固定字符串`1.0`，不是记录修订号 |
| dataset_version | 固定字符串`fields-import-v1`，不是数据每次修改递增的版本 |
| case_id、label | 字符串；case_id不是已保存Episode ID |
| data_mode | `real` / `constructed` |
| created_at、updated_at | 带offset的ISO8601管理时间；不证明历史可得性，不是revision/hash |
| trades、reasons、events、market_bars | 对应四类记录数组；上限5000/1000/1000/5000 |
| import_batches | 批次数组，上限100 |
| active_reason_id | 当前展示的理由ID或null，不是已核验理由或报告版本 |

业务ID有trade_id、reason_id、event_id、bar_id、batch_id；每条另有evidence.evidence_id。ID为1–160字符，固定案例使用稳定固定ID，用户录入通常生成UUID，证据ID使用`evidence-${记录ID}`。重载已保存数据保留ID。各类业务ID在本数组内不重复，evidence_id在四类数组之间唯一；并非所有业务ID跨类型都要求相互不同。

理由必须关联同证券的有效trade_id，交易必须关联存在的batch_id，active_reason_id必须存在；各记录和批次data_mode须与根对象一致。事件入口限制证券存在于当前交易；schema本身没有完整Episode归属校验。reason/event的episode_id字段可空，现有固定/新增记录为null。行情的market_snapshot_id仅是bar记录上的字符串关联标识，没有完整MarketSnapshot对象/版本表。

持仓派生ID为`position-${首次买入trade_id}`，是程序视图ID，不是已持久化、已确认完整性的Episode及revision。浏览器存储键`investment-review:fields-import:v1`；保存前比较存储原文防覆盖冲突，4MiB上限，不是SPEC的document_revision协议。CSV导入确认后替换整个当前Dataset，不合并旧过程；备份保留采用字段/来源位置，不保证保存原CSV全文。

**当前不存在**package_id、episode_revision、input_hash、prior_package_id、prior_input_hash、正式metric_id、证据快照record_id/values/excluded等协议字段的生成与验证器。不能让模型自行编造这些字段，不能用updated_at或case_id冒充修订号/哈希。

## 3. 四类记录的公共字段与证据标签

每类记录公共字段：`data_mode`、可选`is_constructed: boolean`、`created_at`、`updated_at`、嵌套`evidence`。日期为YYYY-MM-DD；datetime接受明确offset，日期一致性按上海自然日校验。固定结构严格拒绝未知键；source_fields/units为允许扩展的字符串映射。

| evidence字段 | 当前规则 |
| --- | --- |
| evidence_id | 非空唯一证据ID |
| source_type | `synthetic` / `user_provided` / `provider_api` |
| source_name、source_reference | 非空来源名称、文件行/本地记录/固定素材定位；并不证明真实性 |
| source_fields | 字段名→来源字段位置字符串；不是模型引用用的values对象 |
| units | 字段名→单位字符串；例如quantity=股、price=元/股、fee=元，事件文本=文本 |
| timezone | 固定`Asia/Shanghai` |
| first_available | `{date, at, precision, basis}`；precision为`datetime` / `date` / `unknown` |
| fetched_at | 带offset时刻或null；本地输入不冒充供应商取数，保留null |
| quality | `{status, notes}`；status为`synthetic` / `unverified` / `verified` / `missing` / `conflict`；notes至多20项，每项至多2000字符 |

时间一致性：datetime必须有日期和时刻且上海日期一致；date必须日期非空、at=null；unknown必须date/at均null。basis保存依据，不用录入时间、取数时间、事件发生日期或网页当前更新时间补造首次可得时间。

内置固定素材source_type和quality.status均synthetic，可不含可选is_constructed字段，不能因字段缺失误当真实资料。用户CSV、理由、TXT事件入口均为user_provided/unverified；构造模式另存is_constructed=true，保留构造声明。构造模式只允许DEMO001，不能混入provider_api或verified；真实模式不允许DEMO001、synthetic或is_constructed=true。真实证券格式为六位数字加.SH/.SZ/.BJ，格式正确不证明证券存在。

quality枚举允许verified等标签，不表示已实现真实性核验；现有用户入口不会给出verified。费用缺失保留fee=null和说明，不将整条user_provided记录自动升级验证。历史版本确认只是用户声明；has_time_conflict初始false也不意味着独立核验过。时间分类prior仅表示时间上可能获得，不证明用户实际看过、内容真实或存在因果。

## 4. 实际记录字段清单

下表各类均额外包含上节公共字段。

| 类型 | 实际专属字段与类型 |
| --- | --- |
| Trade | trade_id、batch_id字符串；source_row整数≥2；symbol字符串；name≤100字符；trade_date日期；trade_at时刻或null；time_precision=`datetime`/`date`；side=`BUY`/`SELL`；quantity正安全整数（股）；price正十进制字符串（元/股）；fee非负十进制字符串或null（元）；same_day_order正整数或null；order_confirmed布尔 |
| Reason | reason_id字符串；episode_id字符串或null；trade_id、symbol字符串；record_type=`contemporaneous`/`recollection`；judgment非空文本；expected_evidence、invalidation_condition、source_excerpt文本；source_url为http/https或null；formed_date/formed_at可空；time_precision=`datetime`/`date`/`unknown`；historical_version_confirmed、has_time_conflict布尔 |
| Event | event_id字符串；episode_id字符串或null；symbol、title（非空）、excerpt文本；source_url为http/https或null；occurred_date日期或null；published_date/published_at可空；time_precision同Reason；historical_version_confirmed、has_time_conflict布尔 |
| MarketBar | bar_id、market_snapshot_id、symbol字符串；trade_date日期；open/high/low/close正十进制字符串；volume/turnover非负十进制字符串；currency固定`CNY`；adjust固定`none`；upstream_data_timestamp时刻或null |
| ImportBatch | batch_id、filename（≤255字符）、imported_at时刻、data_mode；adopted_rows/excluded_rows整数数组；ignored_blank_rows非负整数；duplicate_decisions数组`{group, excluded_rows}`；order_confirmations字符串数组 |

文本字段通常≤2000字符，理由形成时间必须与first_available匹配，事件first_available必须与公开时间匹配。行情OHLC关系校验；provider_api日线缺可靠首次公开契约时强制first_available.precision=unknown，不从trade_date或上游时间戳推造。

价格/费用格式为非负普通十进制，最多15位整数、6位小数，不接受指数、NaN、Infinity、单位字符串；quantity为Number安全整数，但累计数量用BigInt。fee="0"是明确零，fee=null是未知。

CSV九列表头：`symbol,name,trade_date,trade_time,side,quantity,price,fee,same_day_order`。trade_time为HH:mm:ss或空，解析为上海offset时间；空时间保留仅日期。CSV未提供原记录首次可得证明，因此其first_available为unknown。事件入口仅UTF-8 TXT/手动摘录，64KiB/2000字符上限，不自动访问链接、解析发布时刻或抓取网页。

## 5. 时间分类：程序决定，模型不能重分

`unifiedEvidence`基础投影含id（evidence_id）、kind、title、date、at、precision、time_basis、time_class=pending和record原记录；pending仅为未指定决策的内部状态，不是第四种模型分类。kind仅`trade`/`reason`/`event`/`market_bar`，当前不含metric。

`classifyEvidence(dataset, decisionTradeId)`先按所选证券和data_mode过滤，输出`prior`/`post`/`unknown`与explanation；`decisionCutoff`返回at/basis。投影date/at是展示日期（行情投影at=null），实际判断读record.evidence.first_available，不能按时间线排序位置猜测先后。

| 边界 | 当前实现 |
| --- | --- |
| 精确交易时刻 | 仅严格小于边界为prior；等于/晚于为post |
| 仅日期交易 | 上海当日00:00保守截止，不是补造的真实成交时刻 |
| 仅日期证据 | 按整日区间比较：整日早于边界才prior；整日起点≥边界为post；区间跨边界为unknown。同日盘中交易的仅日期消息为unknown，不填00:00 |
| 首次可得未知 | unknown，不用fetched_at、created_at、发生日期替代 |
| 历史版本未确认或时间/来源冲突 | unknown，不能凭旧发布日期把当前修订文字放入事前 |
| 当前选中交易 | 成交价/数量/费用是执行结果，整个交易条目post；A只用ID、证券、方向及截止边界作定位元数据 |
| 其他交易 | 其执行时点及首次可得都须满足事前边界；未来成交是post，历史CSV成交因首次可得未知也不自动变prior |
| 理由 | 形成时间/版本受限；recollection即使填写更早形成时间也不能作为已证明的当时依据；关联未证明发生于边界前的后续交易理由也不能进入prior |
| 完整日线 | 同日及未来日线不能进入prior，即使误填更早可得时刻或决策在夜间。缺首次可得证明仍unknown；历史日线也不证明已还原当时数据版本 |

代码不自动核验历史原文或侦测所有内容冲突；模型不能绕过这些规则。所有数据的事后总盈亏相对任一决策均不能变成事前收益。

## 6. 持仓与现金盈亏口径

`recognizePositions`按证券+模式分组，按日期及精确时刻/已确认同日顺序排序。零持仓买入开始、回到零持仓结束；归零后再次买入另起过程。输出processes/issues；每个过程含id、symbol、data_mode、trades、status=`closed`/`open`、quantity（BigInt）。错误码为`PENDING_ORDER`、`ORDER_CONFLICT`、`SELL_BEFORE_BUY`、`OVERSELL`。受影响证券不强行生成可信盈亏，不能用未来买入修补先卖/超卖。

`calculateCash(process, corporateActions)`重新验证过程。corporateActions为`unknown`/`none_confirmed`/`present`，页面本次临时选择，不保存。none_confirmed只代表用户本次声明；期初/遗漏确认仍未实现，闭合指标始终provisional。present阻止简化盈亏；open不计算完整盈亏、不按市价假定卖出。

| 返回字段 | 口径 |
| --- | --- |
| buy_cents、sell_cents | 各笔quantity×price的累计买入额B/卖出额S，不含费用 |
| known_fee_cents | 已知费用小计；没有已知项可为0，但不等于总费用已知为0 |
| missing_fee_count | fee=null的笔数 |
| total_fee_cents | 任何缺费则null，否则全部实际费用 |
| gross_pnl_cents | closed且公司行动非present时为S−B；否则null |
| net_pnl_cents | gross可计算且全部费用已知时为S−B−fees；否则null |
| status | `provisional`（允许暂算）/`blocked`（阻止完整盈亏），不是行情接入或报告成功状态 |
| input_trade_ids、dependency_evidence_ids | 原交易及证据ID数组，模型不能替换计算结果或依赖 |
| limitations | 未确认完整、费用、未清仓、公司行动、舍入等说明 |

金额内部用BigInt：元输入按10^6整数子单位精确计算，一分=10000子单位；先累计/求差，最后按绝对值四舍五入为整数分并恢复符号。quantity累计也用BigInt，不用浮点推算费用。显示金额各自舍入，显示值再相减可能差一分。**返回的BigInt不能直接JSON.stringify**；下方文档示例将整数分无损写为十进制字符串，仅是文档序列化方式，尚未建立正式AI传输schema。

当前不计算已实现收益率、年化、基准超额、回撤、浮动盈亏或行情解释指标；不能从CSV现金差额推出价格波动原因或投资能力。现金指标来自用户CSV/固定交易，不是行情接口提供。

## 7. unavailable与未核验限制

真实行情保持unavailable。已有2026-10-10上海09:20、09:21两次单次历史日线请求均网络失败，无HTTP、业务code或有效数据；权限未确认，不等于鉴权拒绝/权限不足。没有已确认合法、适用且可追溯的真实历史快照。

页面尚未接供应商；构造素材/上传成功、故障mock均不改变真实状态。独立脚本本地结果有`DATA_SOURCE_NETWORK_ERROR`、`DATA_SOURCE_TIMEOUT`、`DATA_SOURCE_AUTH_FAILED`、`DATA_SOURCE_PERMISSION_DENIED`、`DATA_SOURCE_RATE_LIMITED`、`DATA_SOURCE_HTTP_ERROR`、`DATA_SOURCE_UPSTREAM_ERROR`、`DATA_SOURCE_SCHEMA_INVALID`、`DATA_SOURCE_CONFLICT`、`EMPTY_RESULT`、`SUCCESS`；配置检查另有`DATA_SOURCE_NOT_CONFIGURED`/`DATA_SOURCE_BASE_URL_INVALID`。这些是脚本结果，不是已持久化的模型data_quality协议或页面动态接口错误。

冲突校验限定同响应同标的/日期/1d/none数值不同；跨快照冲突未实现。历史接口即使将来单次成功也不能证明所有接口开放、所有日期完整或资料许可已核验。缺行情不得补零、随机生成、静默回退synthetic或生成依赖缺行情的确定解释；但可展示明确来自交易且受完整性限制的现金暂算值。用户事件、理由及交易在本地仍可查看/保存。

## 8. SPEC要求与后续契约设计的边界

SPEC阶段A名称`prior_assessment`：定位字段为schema_version、stage、package_id、episode_id、episode_revision、input_hash、decision_trade_id、symbol、action、cutoff_at、cutoff_basis；只传允许的evidence和不泄漏未来的limitations/instructions。禁止当前交易实际成交价/数量/费用、最终盈亏、之后交易/理由、后续行情/事件、回忆、B结果。不得在metadata、被排除列表、附件、完整JSON、隐藏提示词或限制文字里携带未来详情；切换交易必须重新按该边界取证。

SPEC阶段B名称`outcome_review`：正式输入还需已导入且已校验、绑定同版本同交易的prior_assessment，以及prior_package_id/prior_input_hash/prior_evidence原快照；有本过程全部交易、程序指标、理由、完整证据及逐交易decision_visibility。B须使用新包ID/哈希，不能复用A哈希。现有代码可以逐交易计算分类，但没有保存SPEC的decision_visibility协议对象。

SPEC证据快照kind还包括metric；其values、source_locator、availability_basis、available_date/at、excluded等与当前嵌套Evidence/record结构不同，不能声称字段可直接互换。SPEC引用为`{evidence_id, field_path, usage}`，field_path是values内JSON Pointer；usage为`prior_basis`/`execution_fact`/`subsequent_change`/`recollection`/`limitation`。A仅prior_basis或limitation；时间未知只能limitation，回忆只能recollection或limitation。现有source_fields字符串不能冒充已实现的引用路径校验。

正式包前提还包括已确认执行顺序、无负持仓/最终归零、确认期初无持仓/无遗漏/无公司行动；目前后几项没有完整持久化确认流程，因此下方示例不是正式可提交包。SPEC规定512KiB包/结果上限、规范化SHA-256、不变快照和过期校验，均未实现；不要生成看似真实的package_id、revision、hash或伪造已校验A输出。

## 9. 纯构造A输入素材示例

仅取现有`public/samples/demo-case.json`固定DEMO001案例的**首次买入决策**，不是3月10日买入的人工验收CSV。下方独立JSON块由现有classifyEvidence的prior子集整理：只有构造前日行情、事前事件和当时理由。未附完整Dataset、链接附件、其他分类清单或统计数量。source_reference仅保留允许记录的原定位，不随包附送其所在的完整固定素材文件。

这不是已经实现的包schema：外层stage/decision_trade_id等是用于讨论分阶段输入的说明字段；evidence中的kind/time_class/explanation/record来自当前分类投影，尚未转成SPEC的values快照。没有假package_id/revision/hash。提供给实际A评估时只复制A JSON块，不附本文件B部分、固定案例全文件或其他完整时间线。不要把设计契约时可看到的B内容带入A评估。

```json
{
  "schema_version": "1.0",
  "stage": "prior_assessment",
  "decision_trade_id": "demo001-buy",
  "symbol": "DEMO001",
  "action": "BUY",
  "cutoff_at": "2025-03-03T10:00:00+08:00",
  "cutoff_basis": "实际成交时刻之前，严格小于边界",
  "evidence": [
    {
      "kind": "event",
      "time_class": "prior",
      "explanation": "已记录的首次可得时刻严格早于决策边界。",
      "record": {
        "evidence": {
          "evidence_id": "evidence-demo001-event-prior",
          "source_type": "synthetic",
          "source_name": "固定构造案例 DEMO001",
          "source_reference": "public/samples/demo-case.json#demo001-event-prior",
          "source_fields": {
            "title": "/title",
            "excerpt": "/excerpt",
            "published_date": "/published_date",
            "published_at": "/published_at"
          },
          "units": {
            "excerpt": "文本",
            "published_at": "ISO8601"
          },
          "timezone": "Asia/Shanghai",
          "first_available": {
            "date": "2025-02-28",
            "at": "2025-02-28T18:00:00+08:00",
            "precision": "datetime",
            "basis": "固定构造的首次公开时间；不是现实公告"
          },
          "fetched_at": "2026-10-10T00:00:00+08:00",
          "quality": {
            "status": "synthetic",
            "notes": [
              "完全构造，不对应真实公司、行情或新闻；取数时间表示本地案例制作时间。"
            ]
          }
        },
        "data_mode": "constructed",
        "created_at": "2026-10-10T00:00:00+08:00",
        "updated_at": "2026-10-10T00:00:00+08:00",
        "event_id": "demo001-event-prior",
        "episode_id": null,
        "symbol": "DEMO001",
        "title": "构造事件：流程改进说明",
        "excerpt": "虚构示例公司公开了一份流程改进说明。本条只用于演示事前公开信息。",
        "source_url": null,
        "occurred_date": null,
        "published_date": "2025-02-28",
        "published_at": "2025-02-28T18:00:00+08:00",
        "time_precision": "datetime",
        "historical_version_confirmed": true,
        "has_time_conflict": false
      }
    },
    {
      "kind": "market_bar",
      "time_class": "prior",
      "explanation": "已记录的首次可得时刻严格早于决策边界。 完整日线仅在决策日期之前才可能进入事前；此条为构造行情。",
      "record": {
        "evidence": {
          "evidence_id": "evidence-demo001-bar-before",
          "source_type": "synthetic",
          "source_name": "固定构造案例 DEMO001",
          "source_reference": "public/samples/demo-case.json#demo001-bar-before",
          "source_fields": {
            "trade_date": "/trade_date",
            "open": "/open",
            "high": "/high",
            "low": "/low",
            "close": "/close",
            "volume": "/volume",
            "turnover": "/turnover"
          },
          "units": {
            "open": "元/股",
            "high": "元/股",
            "low": "元/股",
            "close": "元/股",
            "volume": "股",
            "turnover": "元"
          },
          "timezone": "Asia/Shanghai",
          "first_available": {
            "date": "2025-03-02",
            "at": "2025-03-02T18:00:00+08:00",
            "precision": "datetime",
            "basis": "构造日线在18:00才首次可得；不表示真实市场接口的公开时刻"
          },
          "fetched_at": "2026-10-10T00:00:00+08:00",
          "quality": {
            "status": "synthetic",
            "notes": [
              "完全构造，不对应真实公司、行情或新闻；取数时间表示本地案例制作时间。"
            ]
          }
        },
        "data_mode": "constructed",
        "created_at": "2026-10-10T00:00:00+08:00",
        "updated_at": "2026-10-10T00:00:00+08:00",
        "bar_id": "demo001-bar-before",
        "market_snapshot_id": "demo001-market-v1",
        "symbol": "DEMO001",
        "trade_date": "2025-03-02",
        "open": "9.5",
        "high": "10",
        "low": "9.2",
        "close": "9.8",
        "volume": "1000",
        "turnover": "9800",
        "currency": "CNY",
        "adjust": "none",
        "upstream_data_timestamp": null
      }
    },
    {
      "kind": "reason",
      "time_class": "prior",
      "explanation": "已记录的首次可得时刻严格早于决策边界。",
      "record": {
        "evidence": {
          "evidence_id": "evidence-demo001-reason-contemporaneous",
          "source_type": "synthetic",
          "source_name": "固定构造案例 DEMO001",
          "source_reference": "public/samples/demo-case.json#demo001-reason-contemporaneous",
          "source_fields": {
            "judgment": "/judgment",
            "expected_evidence": "/expected_evidence",
            "invalidation_condition": "/invalidation_condition",
            "formed_at": "/formed_at"
          },
          "units": {
            "judgment": "文本",
            "formed_at": "ISO8601"
          },
          "timezone": "Asia/Shanghai",
          "first_available": {
            "date": "2025-03-03",
            "at": "2025-03-03T09:30:00+08:00",
            "precision": "datetime",
            "basis": "固定构造当时日记的形成时间"
          },
          "fetched_at": "2026-10-10T00:00:00+08:00",
          "quality": {
            "status": "synthetic",
            "notes": [
              "完全构造，不对应真实公司、行情或新闻；取数时间表示本地案例制作时间。"
            ]
          }
        },
        "data_mode": "constructed",
        "created_at": "2026-10-10T00:00:00+08:00",
        "updated_at": "2026-10-10T00:00:00+08:00",
        "reason_id": "demo001-reason-contemporaneous",
        "episode_id": null,
        "trade_id": "demo001-buy",
        "symbol": "DEMO001",
        "record_type": "contemporaneous",
        "judgment": "构造日记：希望检验此前公开的流程改进说明是否得到后续材料支持。",
        "expected_evidence": "后续定期记录中可核查的进度材料。",
        "invalidation_condition": "关键进度与原假设不一致时，应重新记录判断依据。",
        "source_excerpt": "构造当时记录：尚无法确认流程改进能否持续。",
        "source_url": null,
        "formed_date": "2025-03-03",
        "formed_at": "2025-03-03T09:30:00+08:00",
        "time_precision": "datetime",
        "historical_version_confirmed": true,
        "has_time_conflict": false
      }
    }
  ],
  "limitations": [
    "全部为synthetic构造材料，不对应真实公司、交易或公告；不证明投资者实际知悉。",
    "真实行情unavailable，没有可用真实历史快照，不能进行依赖真实行情的判断。",
    "构造前日日线2025-03-02为周日，不是真实A股交易日；未还原真实历史版本。",
    "尚无正式不可变证据包、完整性确认、包版本与哈希。"
  ],
  "instructions": [
    "只评估定位决策在截止前的证据支持、假设和缺口。",
    "时间分类由程序提供；不重分、不补证据ID或缺失数据，不输出确定涨跌、买卖建议或收益结果。"
  ]
}
```

此处管理时间是素材制作时间，不是历史公开时间；is_constructed未出现在旧固定记录中时，data_mode=constructed及synthetic标签仍明确表明构造。前日日线日期2025-03-02为周日，完全构造，不可解释为真实A股交易日。

## 10. 纯构造B输入素材示例

B示例由同一固定构造案例的全部九条记录、按首次买入决策的分类及程序现金暂算输出整理。全部synthetic，不对应真实公司或真实公告；真实行情状态仍unavailable。只保留输入素材，不编写模型解释或伪造已校验的阶段A输出。

同样不是正式包：evidence里的record包含完整交易/理由/事件/日线，未重复另外展开trades/reasons；正式SPEC的包字段映射仍待设计。缺少已校验prior_assessment和包绑定，**当前不能进入正式阶段B生成**；不能让模型补一个A结果。classified time_class只相对该选定交易，其他决策需重新计算，不用这个分类表代表所有交易。

```json
{
  "schema_version": "1.0",
  "stage": "outcome_review",
  "decision_trade_id": "demo001-buy",
  "symbol": "DEMO001",
  "cutoff_at": "2025-03-03T10:00:00+08:00",
  "cutoff_basis": "实际成交时刻之前，严格小于边界",
  "evidence": [
    {
      "kind": "event",
      "time_class": "prior",
      "explanation": "已记录的首次可得时刻严格早于决策边界。",
      "record": {
        "evidence": {
          "evidence_id": "evidence-demo001-event-prior",
          "source_type": "synthetic",
          "source_name": "固定构造案例 DEMO001",
          "source_reference": "public/samples/demo-case.json#demo001-event-prior",
          "source_fields": {
            "title": "/title",
            "excerpt": "/excerpt",
            "published_date": "/published_date",
            "published_at": "/published_at"
          },
          "units": {
            "excerpt": "文本",
            "published_at": "ISO8601"
          },
          "timezone": "Asia/Shanghai",
          "first_available": {
            "date": "2025-02-28",
            "at": "2025-02-28T18:00:00+08:00",
            "precision": "datetime",
            "basis": "固定构造的首次公开时间；不是现实公告"
          },
          "fetched_at": "2026-10-10T00:00:00+08:00",
          "quality": {
            "status": "synthetic",
            "notes": [
              "完全构造，不对应真实公司、行情或新闻；取数时间表示本地案例制作时间。"
            ]
          }
        },
        "data_mode": "constructed",
        "created_at": "2026-10-10T00:00:00+08:00",
        "updated_at": "2026-10-10T00:00:00+08:00",
        "event_id": "demo001-event-prior",
        "episode_id": null,
        "symbol": "DEMO001",
        "title": "构造事件：流程改进说明",
        "excerpt": "虚构示例公司公开了一份流程改进说明。本条只用于演示事前公开信息。",
        "source_url": null,
        "occurred_date": null,
        "published_date": "2025-02-28",
        "published_at": "2025-02-28T18:00:00+08:00",
        "time_precision": "datetime",
        "historical_version_confirmed": true,
        "has_time_conflict": false
      }
    },
    {
      "kind": "market_bar",
      "time_class": "prior",
      "explanation": "已记录的首次可得时刻严格早于决策边界。 完整日线仅在决策日期之前才可能进入事前；此条为构造行情。",
      "record": {
        "evidence": {
          "evidence_id": "evidence-demo001-bar-before",
          "source_type": "synthetic",
          "source_name": "固定构造案例 DEMO001",
          "source_reference": "public/samples/demo-case.json#demo001-bar-before",
          "source_fields": {
            "trade_date": "/trade_date",
            "open": "/open",
            "high": "/high",
            "low": "/low",
            "close": "/close",
            "volume": "/volume",
            "turnover": "/turnover"
          },
          "units": {
            "open": "元/股",
            "high": "元/股",
            "low": "元/股",
            "close": "元/股",
            "volume": "股",
            "turnover": "元"
          },
          "timezone": "Asia/Shanghai",
          "first_available": {
            "date": "2025-03-02",
            "at": "2025-03-02T18:00:00+08:00",
            "precision": "datetime",
            "basis": "构造日线在18:00才首次可得；不表示真实市场接口的公开时刻"
          },
          "fetched_at": "2026-10-10T00:00:00+08:00",
          "quality": {
            "status": "synthetic",
            "notes": [
              "完全构造，不对应真实公司、行情或新闻；取数时间表示本地案例制作时间。"
            ]
          }
        },
        "data_mode": "constructed",
        "created_at": "2026-10-10T00:00:00+08:00",
        "updated_at": "2026-10-10T00:00:00+08:00",
        "bar_id": "demo001-bar-before",
        "market_snapshot_id": "demo001-market-v1",
        "symbol": "DEMO001",
        "trade_date": "2025-03-02",
        "open": "9.5",
        "high": "10",
        "low": "9.2",
        "close": "9.8",
        "volume": "1000",
        "turnover": "9800",
        "currency": "CNY",
        "adjust": "none",
        "upstream_data_timestamp": null
      }
    },
    {
      "kind": "trade",
      "time_class": "post",
      "explanation": "当前交易最终成交价、数量和费用属于执行结果，不是该交易事前已知事实。",
      "record": {
        "evidence": {
          "evidence_id": "evidence-demo001-buy",
          "source_type": "synthetic",
          "source_name": "固定构造案例 DEMO001",
          "source_reference": "public/samples/demo-case.json#demo001-buy",
          "source_fields": {
            "trade_date": "/trade_date",
            "trade_at": "/trade_at",
            "side": "/side",
            "quantity": "/quantity",
            "price": "/price",
            "fee": "/fee"
          },
          "units": {
            "quantity": "股",
            "price": "元/股",
            "fee": "元"
          },
          "timezone": "Asia/Shanghai",
          "first_available": {
            "date": "2025-03-03",
            "at": "2025-03-03T10:00:00+08:00",
            "precision": "datetime",
            "basis": "构造成交记录的成交时间，不代表买入之前已知道成交结果"
          },
          "fetched_at": "2026-10-10T00:00:00+08:00",
          "quality": {
            "status": "synthetic",
            "notes": [
              "完全构造，不对应真实公司、行情或新闻；取数时间表示本地案例制作时间。"
            ]
          }
        },
        "data_mode": "constructed",
        "created_at": "2026-10-10T00:00:00+08:00",
        "updated_at": "2026-10-10T00:00:00+08:00",
        "trade_id": "demo001-buy",
        "batch_id": "demo001-batch-v1",
        "source_row": 2,
        "symbol": "DEMO001",
        "name": "构造示例公司",
        "trade_date": "2025-03-03",
        "trade_at": "2025-03-03T10:00:00+08:00",
        "time_precision": "datetime",
        "side": "BUY",
        "quantity": 100,
        "price": "10",
        "fee": "5",
        "same_day_order": 1,
        "order_confirmed": true
      }
    },
    {
      "kind": "reason",
      "time_class": "prior",
      "explanation": "已记录的首次可得时刻严格早于决策边界。",
      "record": {
        "evidence": {
          "evidence_id": "evidence-demo001-reason-contemporaneous",
          "source_type": "synthetic",
          "source_name": "固定构造案例 DEMO001",
          "source_reference": "public/samples/demo-case.json#demo001-reason-contemporaneous",
          "source_fields": {
            "judgment": "/judgment",
            "expected_evidence": "/expected_evidence",
            "invalidation_condition": "/invalidation_condition",
            "formed_at": "/formed_at"
          },
          "units": {
            "judgment": "文本",
            "formed_at": "ISO8601"
          },
          "timezone": "Asia/Shanghai",
          "first_available": {
            "date": "2025-03-03",
            "at": "2025-03-03T09:30:00+08:00",
            "precision": "datetime",
            "basis": "固定构造当时日记的形成时间"
          },
          "fetched_at": "2026-10-10T00:00:00+08:00",
          "quality": {
            "status": "synthetic",
            "notes": [
              "完全构造，不对应真实公司、行情或新闻；取数时间表示本地案例制作时间。"
            ]
          }
        },
        "data_mode": "constructed",
        "created_at": "2026-10-10T00:00:00+08:00",
        "updated_at": "2026-10-10T00:00:00+08:00",
        "reason_id": "demo001-reason-contemporaneous",
        "episode_id": null,
        "trade_id": "demo001-buy",
        "symbol": "DEMO001",
        "record_type": "contemporaneous",
        "judgment": "构造日记：希望检验此前公开的流程改进说明是否得到后续材料支持。",
        "expected_evidence": "后续定期记录中可核查的进度材料。",
        "invalidation_condition": "关键进度与原假设不一致时，应重新记录判断依据。",
        "source_excerpt": "构造当时记录：尚无法确认流程改进能否持续。",
        "source_url": null,
        "formed_date": "2025-03-03",
        "formed_at": "2025-03-03T09:30:00+08:00",
        "time_precision": "datetime",
        "historical_version_confirmed": true,
        "has_time_conflict": false
      }
    },
    {
      "kind": "event",
      "time_class": "post",
      "explanation": "首次可得时刻晚于或等于决策边界；相等不算事前。",
      "record": {
        "evidence": {
          "evidence_id": "evidence-demo001-event-after",
          "source_type": "synthetic",
          "source_name": "固定构造案例 DEMO001",
          "source_reference": "public/samples/demo-case.json#demo001-event-after",
          "source_fields": {
            "title": "/title",
            "excerpt": "/excerpt",
            "published_date": "/published_date",
            "published_at": "/published_at"
          },
          "units": {
            "excerpt": "文本",
            "published_at": "ISO8601"
          },
          "timezone": "Asia/Shanghai",
          "first_available": {
            "date": "2025-03-03",
            "at": "2025-03-03T18:00:00+08:00",
            "precision": "datetime",
            "basis": "固定构造的首次公开时间；不是现实公告"
          },
          "fetched_at": "2026-10-10T00:00:00+08:00",
          "quality": {
            "status": "synthetic",
            "notes": [
              "完全构造，不对应真实公司、行情或新闻；取数时间表示本地案例制作时间。"
            ]
          }
        },
        "data_mode": "constructed",
        "created_at": "2026-10-10T00:00:00+08:00",
        "updated_at": "2026-10-10T00:00:00+08:00",
        "event_id": "demo001-event-after",
        "episode_id": null,
        "symbol": "DEMO001",
        "title": "构造事件：后续进度补充",
        "excerpt": "构造的进度补充在买入当天18:00才公开，不能作为上午买入的事前依据。",
        "source_url": null,
        "occurred_date": null,
        "published_date": "2025-03-03",
        "published_at": "2025-03-03T18:00:00+08:00",
        "time_precision": "datetime",
        "historical_version_confirmed": true,
        "has_time_conflict": false
      }
    },
    {
      "kind": "event",
      "time_class": "unknown",
      "explanation": "仅日期信息的整日区间跨越决策边界，不能假定在成交前公开。",
      "record": {
        "evidence": {
          "evidence_id": "evidence-demo001-event-date-only",
          "source_type": "synthetic",
          "source_name": "固定构造案例 DEMO001",
          "source_reference": "public/samples/demo-case.json#demo001-event-date-only",
          "source_fields": {
            "title": "/title",
            "excerpt": "/excerpt",
            "published_date": "/published_date",
            "published_at": "/published_at"
          },
          "units": {
            "excerpt": "文本",
            "published_at": "ISO8601"
          },
          "timezone": "Asia/Shanghai",
          "first_available": {
            "date": "2025-03-03",
            "at": null,
            "precision": "date",
            "basis": "固定构造的首次公开时间；不是现实公告"
          },
          "fetched_at": "2026-10-10T00:00:00+08:00",
          "quality": {
            "status": "synthetic",
            "notes": [
              "完全构造，不对应真实公司、行情或新闻；取数时间表示本地案例制作时间。"
            ]
          }
        },
        "data_mode": "constructed",
        "created_at": "2026-10-10T00:00:00+08:00",
        "updated_at": "2026-10-10T00:00:00+08:00",
        "event_id": "demo001-event-date-only",
        "episode_id": null,
        "symbol": "DEMO001",
        "title": "构造事件：只有公开日期的记录",
        "excerpt": "只能确认公开日期，没有小时，不能确定上午买入时是否已经可得。",
        "source_url": null,
        "occurred_date": null,
        "published_date": "2025-03-03",
        "published_at": null,
        "time_precision": "date",
        "historical_version_confirmed": true,
        "has_time_conflict": false
      }
    },
    {
      "kind": "market_bar",
      "time_class": "post",
      "explanation": "首次可得时刻晚于或等于决策边界；相等不算事前。 完整日线仅在决策日期之前才可能进入事前；此条为构造行情。",
      "record": {
        "evidence": {
          "evidence_id": "evidence-demo001-bar-buy-day",
          "source_type": "synthetic",
          "source_name": "固定构造案例 DEMO001",
          "source_reference": "public/samples/demo-case.json#demo001-bar-buy-day",
          "source_fields": {
            "trade_date": "/trade_date",
            "open": "/open",
            "high": "/high",
            "low": "/low",
            "close": "/close",
            "volume": "/volume",
            "turnover": "/turnover"
          },
          "units": {
            "open": "元/股",
            "high": "元/股",
            "low": "元/股",
            "close": "元/股",
            "volume": "股",
            "turnover": "元"
          },
          "timezone": "Asia/Shanghai",
          "first_available": {
            "date": "2025-03-03",
            "at": "2025-03-03T18:00:00+08:00",
            "precision": "datetime",
            "basis": "构造日线在18:00才首次可得；不表示真实市场接口的公开时刻"
          },
          "fetched_at": "2026-10-10T00:00:00+08:00",
          "quality": {
            "status": "synthetic",
            "notes": [
              "完全构造，不对应真实公司、行情或新闻；取数时间表示本地案例制作时间。"
            ]
          }
        },
        "data_mode": "constructed",
        "created_at": "2026-10-10T00:00:00+08:00",
        "updated_at": "2026-10-10T00:00:00+08:00",
        "bar_id": "demo001-bar-buy-day",
        "market_snapshot_id": "demo001-market-v1",
        "symbol": "DEMO001",
        "trade_date": "2025-03-03",
        "open": "10",
        "high": "10.5",
        "low": "9.5",
        "close": "9.7",
        "volume": "1200",
        "turnover": "11640",
        "currency": "CNY",
        "adjust": "none",
        "upstream_data_timestamp": null
      }
    },
    {
      "kind": "trade",
      "time_class": "post",
      "explanation": "成交事实：首次可得时刻晚于或等于决策边界；相等不算事前。",
      "record": {
        "evidence": {
          "evidence_id": "evidence-demo001-sell",
          "source_type": "synthetic",
          "source_name": "固定构造案例 DEMO001",
          "source_reference": "public/samples/demo-case.json#demo001-sell",
          "source_fields": {
            "trade_date": "/trade_date",
            "trade_at": "/trade_at",
            "side": "/side",
            "quantity": "/quantity",
            "price": "/price",
            "fee": "/fee"
          },
          "units": {
            "quantity": "股",
            "price": "元/股",
            "fee": "元"
          },
          "timezone": "Asia/Shanghai",
          "first_available": {
            "date": "2025-03-10",
            "at": "2025-03-10T14:00:00+08:00",
            "precision": "datetime",
            "basis": "构造成交记录的成交时间，不代表买入之前已知道成交结果"
          },
          "fetched_at": "2026-10-10T00:00:00+08:00",
          "quality": {
            "status": "synthetic",
            "notes": [
              "完全构造，不对应真实公司、行情或新闻；取数时间表示本地案例制作时间。"
            ]
          }
        },
        "data_mode": "constructed",
        "created_at": "2026-10-10T00:00:00+08:00",
        "updated_at": "2026-10-10T00:00:00+08:00",
        "trade_id": "demo001-sell",
        "batch_id": "demo001-batch-v1",
        "source_row": 3,
        "symbol": "DEMO001",
        "name": "构造示例公司",
        "trade_date": "2025-03-10",
        "trade_at": "2025-03-10T14:00:00+08:00",
        "time_precision": "datetime",
        "side": "SELL",
        "quantity": 100,
        "price": "9",
        "fee": "5",
        "same_day_order": 1,
        "order_confirmed": true
      }
    },
    {
      "kind": "reason",
      "time_class": "post",
      "explanation": "首次可得时刻晚于或等于决策边界；相等不算事前。",
      "record": {
        "evidence": {
          "evidence_id": "evidence-demo001-reason-recollection",
          "source_type": "synthetic",
          "source_name": "固定构造案例 DEMO001",
          "source_reference": "public/samples/demo-case.json#demo001-reason-recollection",
          "source_fields": {
            "judgment": "/judgment",
            "expected_evidence": "/expected_evidence",
            "invalidation_condition": "/invalidation_condition",
            "formed_at": "/formed_at"
          },
          "units": {
            "judgment": "文本",
            "formed_at": "ISO8601"
          },
          "timezone": "Asia/Shanghai",
          "first_available": {
            "date": "2025-03-11",
            "at": "2025-03-11T20:00:00+08:00",
            "precision": "datetime",
            "basis": "事后回忆形成时间，不能反推为当时已知"
          },
          "fetched_at": "2026-10-10T00:00:00+08:00",
          "quality": {
            "status": "synthetic",
            "notes": [
              "完全构造，不对应真实公司、行情或新闻；取数时间表示本地案例制作时间。"
            ]
          }
        },
        "data_mode": "constructed",
        "created_at": "2026-10-10T00:00:00+08:00",
        "updated_at": "2026-10-10T00:00:00+08:00",
        "reason_id": "demo001-reason-recollection",
        "episode_id": null,
        "trade_id": "demo001-buy",
        "symbol": "DEMO001",
        "record_type": "recollection",
        "judgment": "构造事后回忆：现在回想，当时可能更关注短期变化，原判断过程记不完整。",
        "expected_evidence": "应寻找当时原始日记，而非将当前记忆当作已知事实。",
        "invalidation_condition": "回忆与原记录不一致时，保留差异和不确定性。",
        "source_excerpt": "这是清仓后形成的构造回忆，不能证明买入时已经知道后续信息。",
        "source_url": null,
        "formed_date": "2025-03-11",
        "formed_at": "2025-03-11T20:00:00+08:00",
        "time_precision": "datetime",
        "historical_version_confirmed": true,
        "has_time_conflict": false
      }
    }
  ],
  "computed_metrics": {
    "buy_cents": "100000",
    "sell_cents": "90000",
    "known_fee_cents": "1000",
    "missing_fee_count": 0,
    "total_fee_cents": "1000",
    "gross_pnl_cents": "-10000",
    "net_pnl_cents": "-11000",
    "status": "provisional",
    "input_trade_ids": [
      "demo001-buy",
      "demo001-sell"
    ],
    "dependency_evidence_ids": [
      "evidence-demo001-buy",
      "evidence-demo001-sell"
    ],
    "limitations": [
      "仅依据已录入交易暂算；期初无持仓和交易无遗漏尚未确认，不是完整投资收益。",
      "买入额 B、卖出额 S 不含费用；费用前盈亏=S−B，现金净盈亏=S−B−全部实际费用。不推算费用、不按市价估计未卖出部分。",
      "金额以 BigInt 整数处理，保留不足一分的输入精度，汇总后四舍五入为整数分；展示两位小数。",
      "公司行动未知，待确认；暂算未计分红、拆股等影响。"
    ]
  },
  "data_quality": {
    "data_mode": "constructed",
    "real_market_status": "unavailable",
    "corporate_actions": "unknown",
    "limitations": [
      "全部九条记录是synthetic构造材料，不是供应商返回值。",
      "当前仅根据录入交易暂算，未确认期初无持仓及交易无遗漏。",
      "两次真实网络失败无HTTP或业务code，不能判为已确认权限不足。",
      "没有已校验阶段A结果及包绑定，不能进入正式阶段B生成。"
    ]
  },
  "instructions": [
    "事后成交、行情、事件只说明执行与后续变化，不能倒推当时必然可知。",
    "回忆明确为回忆；时间未知只说明限制，不作事前依据。",
    "程序计算不能被模型改写；不从单次交易推定稳定心理特征，不以时间接近证明因果。"
  ]
}
```

缺费变体：将两笔fee明确改为null时，实际calculateCash返回missing_fee_count=2、known_fee_cents=0、total_fee_cents=null、gross_pnl_cents=-10000、net_pnl_cents=null；status仍provisional，限制列明费用未知。不能把0小计转成0总费用或声称准确净盈亏。公司行动present或open时gross/net均null。以上仅B口径，不得夹入A。

## 11. 本次整理核对

只新增本文件，没有改变业务/页面/schema/脚本/固定案例，没有请求供应商或调用模型，没有读取Key或私人浏览器存储。JSON示例由现有固定构造素材与本地分类/现金函数整理；核对A仅prior且不包含trade记录/回忆/未来日期，B数据仍为synthetic，金额为程序计算、整数分无损序列化。文档整理不新增测试用例，也不将既有自动化结果写为本轮重新执行或人工通过。

实际本地整理校验：通过`node --import tsx`读取固定素材并调用既有函数，退出0；A为3条prior证据，B为9条synthetic证据；费用前-10000分/净-11000分，缺两笔费用时总费用和净值为null。随后用Node解析本文件两个JSON块并检查无残留模板标记，退出0。没有运行供应商命令、npm全套测试或build，这些不属于本轮新验证结果。
