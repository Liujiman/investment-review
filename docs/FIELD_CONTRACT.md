# 字段与导入阶段协议

当前权威定义：`src/lib/domain/schema.ts`。四类类型使用 `z.infer` 派生，不另行手写平行类型。所有固定结构使用Zod严格对象，拒绝未知字段；`source_fields` / `units` 是有意定义的字符串映射，用来保留不同来源字段与单位。schema_version为1.0，阶段dataset_version为fields-import-v1；这不等于已完成SPEC的完整根对象或报告协议。

## 共享证据元数据

每条交易、理由、事件和行情记录都有 `evidence`：

| 字段 | 含义 |
| --- | --- |
| evidence_id | 稳定唯一证据ID；固定案例ID不因重载变化，导入记录生成UUID |
| source_type | synthetic / user_provided / provider_api；用户输入不是自动验证的事实 |
| source_name / source_reference | 来源名称与定位；构造案例定位到固定JSON内的业务记录ID，CSV定位到物理起始行 |
| source_fields | 字段→来源字段定位；构造素材 `/field` 路径相对于对应原始记录，CSV定位为行号/列名 |
| units | 字段→单位；数量股、价格元/股、费用/成交额元，不能将成交量当成手 |
| timezone | 固定Asia/Shanghai，业务日期按上海自然日 |
| first_available | date / at / precision / basis，分别保存首次可得日期、带时区时刻、精度和依据 |
| fetched_at | 当前取数时间或null，不用来伪造历史可得时间；CSV读取不是供应商取数 |
| quality | status与notes；synthetic / unverified / verified / missing / conflict，文字说明缺口 |

`first_available.precision=date` 时必须保留at=null；unknown时日期和时刻均null；datetime必须有一致的上海日期与带时区时刻。当前导入CSV没有首次公开字段，因此保留unknown，而非将成交/导入时间认作历史原文可得证明。

## 四类记录与SPEC映射

- Trade保留trade_id/batch_id/source_row、symbol/name、trade_date/trade_at/time_precision、side/quantity/price/fee、same_day_order/order_confirmed、data_mode和创建/更新时间。price/fee为十进制字符串，数量为正安全整数；fee=null表示未知，fee="0"才是明确零费用。
- Reason保留reason_id、可空episode_id、trade_id/symbol、record_type、judgment/expected_evidence/invalidation_condition/source_excerpt/source_url、formed_date/formed_at/time_precision、历史版本与时间冲突标志及管理时间。来源名称位于evidence。回忆保存其真实形成日期，不能回写成当时记录。
- Event保留event_id、可空episode_id、symbol、title/excerpt/source_url、occurred_date、published_date/published_at/time_precision、历史版本/冲突标志及管理时间。first_available必须与公开时间一致，发生时间不能替代公开时间。
- MarketBar保留bar_id/market_snapshot_id、symbol/trade_date、OHLC/volume/turnover、currency=CNY、adjust=none、upstream_data_timestamp、管理时间和evidence。OHLC用BigInt十进制定点比较，拒绝非有限/指数数值；单位随来源保留，行情上游时间与首次公开时间分开。真实provider_api日线在缺少首次公开证明时必须first_available=unknown。完整MarketSnapshot与真实源适配待后续建立。

data_mode沿用real / constructed；synthetic是内置固定素材的source_type。构造模式只允许DEMO001，用户CSV、理由、事件输入保留user_provided/unverified，另保存is_constructed=true；不能标为provider_api或verified。可选is_constructed字段用于兼容既有固定素材及旧浏览器记录（旧synthetic记录可不含此字段），新用户入口显式填写；真实模式不得is_constructed=true。真实模式只接受六位股票代码及SH/SZ/BJ后缀，代码格式合法不代表证券存在。构造事件/理由不存在真实公告URL。

## 固定案例与保存

`public/samples/demo-case.json` 为完整可下载构造素材，制作管理时间固定为2026-10-10；这些时间不是历史公开证据。构造行情和事件的first_available单独保存用户要求的历史时点。两份理由均保留，active_reason_id仅选中当前显示版本。

当前持仓过程是基于交易的确定性派生视图，未迁移到SPEC完整Episode保存/修订协议；理由/事件episode_id仍为null，不能据此宣称持仓完整。交易批次保留采用/排除行和重复/顺序决定。CSV正式采用必须无错误、完成必要确认并通过持仓检查；只替换当前数据，替换前明确确认，不合并已有持仓。

浏览器存储键为 `investment-review:fields-import:v1`。保留四类数组、导入批次和选中理由；加载先通过schema和4MB上限校验。root全局ID/证据ID、理由→交易、交易→批次及模式关联都检查。保存前核对当前原始存储，浏览器锁可用时协调写入，storage事件发现外部修改则暂停；不承诺localStorage跨标签页事务。

此阶段 JSON 下载可用于保存素材和人工复用；通用上传/恢复、完整协议迁移、报告关联与哈希校验尚未实现。后续使用共享schema扩展，不把本阶段JSON冒充完整SPEC备份。

## 四区交互补充

`src/lib/domain/reasons.ts` 将用户输入验证为既有Reason，不变更存储版本或覆盖旧理由。原始摘录保持用户输入的原文；formed日期/时刻仅取用户明确填写值，未知时全部null；没有供应商取数时fetched_at=null。historical_version_confirmed来自用户勾选，不代表独立认证；has_time_conflict的初始false不是来源独立核验通过的结论。

`src/lib/domain/timeline.ts` 输出统一记录的基础投影，保留原记录/evidence引用和展示日期；基础投影pending仅表示未指定决策的内部状态。页面实际使用`visibility.ts`按选定交易计算prior/post/unknown及依据，不再显示待计算。共享详情分开独立公开时间、first_available及fetched_at；CSV显示采用字段并定位源行，不声称保存完整原文件。

## 持仓、金额与时间派生协议

`positions.ts`按data_mode和symbol分组，按上海成交日及精确时刻/已确认顺序识别。过程ID取首次买入trade_id，归零关闭，再次买入另起过程。股数用BigInt累积；顺序未确认/矛盾、先卖、超卖返回带交易ID和原CSV行的阻塞原因，受影响证券不生成可信完整过程；其他证券独立处理。正式CSV采用前再次检查，原预览不被修补。

现金指标不保存到原始dataset。B/S为数量乘原始价格的未舍入累计量，已知费用按账单原值累计，gross=S−B、net=S−B−fees。返回金额为BigInt整数分；输入最多6位小数，使用每分10000个整数子单位保留不足一分的精度，仅汇总/差额完成后四舍五入转分，不使用浮点或先舍入单价。负数按绝对值四舍五入再恢复符号。显示指标各自舍入，展示后的金额相减可能有一分差异。任何费用null令总费用/net为null；已知费用小计另列，显式0不是缺费。每项计算保留依赖交易/证据ID。

闭合记录仍为provisional：期初无持仓和交易无遗漏未确认。公司行动unknown亦待确认；present阻止gross/net，但保留录入成交额和费用；open不输出完整盈亏，也不假定按末日价格清仓。公司行动选择为页面临时上下文，不写入存储，筛选/切换决策时保留，刷新/数据更新后失效。正式完整性确认、Episode版本与证据包仍待后续实现。

`visibility.ts`从选中交易确定边界：精确成交时刻，或仅日期交易上海当日00:00的保守边界。时间严格小于才prior，相等为post；仅日期按全日区间判定，跨界unknown。first_available未知不使用fetched_at、发生日或管理日替代。事件/理由历史版本未确认或已标冲突时unknown；回忆不变成当时事实，后续交易理由不能进入事前。当前成交结果排除事前；历史成交还必须满足其执行时点和首次可得时间，CSV未提供可得证明时保守保留unknown。同日及未来完整日线不进入事前，即使误填早于成交的可得时刻；历史行情保留当前获取/版本未还原说明。

分类只针对所选证券及模式；模型未参与且没有模型输入/报告包。页面prior筛选只渲染合规记录，隐藏事后总指标；全部视图明确包含事后记录。历史原文/冲突标志取已有字段，不宣称自动核验新闻页面或历史档案。已有数据及固定素材不覆盖、不补造。

## unavailable与用户事件上传

`data-source-status.ts`保留用户指令下的显式unavailable，展示既有网络失败事实，不探测密钥、不调用接口；构造/上传成功不改变供应商状态。`events.ts`只接受用户字段构造既有Event schema，不接受输入source_type或provider响应信封。用户入口在两种模式下均强制user_provided/unverified，构造模式另强制is_constructed=true；fetched_at=null，管理时间与首次公开分开。

TXT只在客户端解码，UTF-8 fatal、64KiB/2000字符边界与非空验证，不截断。原始摘录保持用户确认的文字，来源定位保留文件名/用户字段位置。标题/来源名称必填，链接仅http/s且不自动访问；未知日期/时刻为null，仅日期不补小时，历史版本来自用户声明。事件append保留旧记录，datasetSchema再次验证，沿用旧存储协议/限额/冲突保护；不迁移或替换旧数据。没有PDF/OCR、网页提取、通用JSON恢复或用户日线导入。
