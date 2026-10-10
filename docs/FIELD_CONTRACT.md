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

data_mode沿用real / constructed；synthetic是source_type，不能静默混用。当前构造模式只允许DEMO001，真实模式只接受六位股票代码及SH/SZ/BJ后缀，代码格式合法不代表证券存在。构造事件/理由不存在真实公告URL。

## 固定案例与保存

`public/samples/demo-case.json` 为完整可下载构造素材，制作管理时间固定为2026-10-10；这些时间不是历史公开证据。构造行情和事件的first_available单独保存用户要求的历史时点。两份理由均保留，active_reason_id仅选中当前显示版本。

本阶段尚未识别Episode，因此理由/事件episode_id=null，不能据此宣称持仓完整。交易批次保留采用/排除行和重复/顺序决定。CSV正式采用必须无错误且完成必要确认；只替换当前字段数据，替换前明确确认，不自动合并/拆分已有持仓。

浏览器存储键为 `investment-review:fields-import:v1`。保留四类数组、导入批次和选中理由；加载先通过schema和4MB上限校验。root全局ID/证据ID、理由→交易、交易→批次及模式关联都检查。保存前核对当前原始存储，浏览器锁可用时协调写入，storage事件发现外部修改则暂停；不承诺localStorage跨标签页事务。

此阶段 JSON 下载可用于保存素材和人工复用；通用上传/恢复、完整协议迁移、报告关联与哈希校验尚未实现。后续使用共享schema扩展，不把本阶段JSON冒充完整SPEC备份。

## 四区交互补充

`src/lib/domain/reasons.ts` 将用户输入验证为既有Reason，不变更存储版本或覆盖旧理由。原始摘录保持用户输入的原文；formed日期/时刻仅取用户明确填写值，未知时全部null；没有供应商取数时fetched_at=null。historical_version_confirmed来自用户勾选，不代表独立认证；has_time_conflict的初始false不是冲突检测通过的结论，界面明确时间分类/冲突检测待计算。

`src/lib/domain/timeline.ts` 输出统一展示记录，保留对原记录和原evidence的引用；仅按成交日期、理由形成日期、事件公开日期、日线标签日期分组，未提供日期的记录单独放置。所有time_class为pending，不做事前/事后判定、不补造时间。共享详情把独立公开时间与first_available/fetched_at分别展示，不存在的发布时间显示未提供，CSV显示规范化采用字段并定位源行，不声称保存了完整原文件。
