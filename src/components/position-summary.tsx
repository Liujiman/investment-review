"use client";

import type { Dataset } from "@/lib/domain/schema";
import { calculateCash, formatCents, recognizePositions, type CorporateActionStatus } from "@/lib/domain/positions";

export default function PositionSummary({ dataset, actions, onAction }: {
  dataset: Dataset; actions: Record<string, CorporateActionStatus>; onAction: (id: string, value: CorporateActionStatus) => void;
}) {
  const result = recognizePositions(dataset.trades);
  return <div aria-label="持仓过程与现金口径" className="mt-5 rounded-xl border border-slate-200 p-4">
    <h3 className="font-semibold">持仓过程与现金口径（事后总览）</h3>
    <p className="mt-2 text-sm text-slate-600">从已录入的零持仓假设识别，未确认期初无持仓及交易无遗漏。不会补造交易；此处总指标不属于任何成交决策的事前证据。</p>
    {result.issues.map((issue) => <p key={`${issue.trade_id}-${issue.code}`} role="alert" className="mt-3 rounded bg-red-50 p-3 text-sm text-red-900">{issue.symbol} · 第{issue.row}行 · {issue.code}：{issue.message} 本证券不展示盈亏，真实记录仍保留在导入区。</p>)}
    {result.processes.map((process, index) => {
      const action = actions[process.id] ?? "unknown";
      const cash = calculateCash(process, action);
      return <article key={process.id} aria-label={`持仓过程 ${index + 1} ${process.symbol}`} className="mt-4 rounded-lg bg-slate-50 p-4">
        <h4 className="font-medium">过程 {index + 1} · {process.symbol} · {process.status === "closed" ? "交易记录已闭合（待完整性确认）" : "尚未清仓"}</h4>
        <p className="mt-2 text-sm">{process.trades[0].trade_date} → {process.status === "closed" ? process.trades.at(-1)!.trade_date : "未结束"} · {process.trades.length} 笔 · 当前持仓 {process.quantity.toString()} 股</p>
        <label className="mt-3 block text-sm">公司行动口径（本页临时选择，不保存）<select className="mt-1 block max-w-full rounded border p-2" value={action} onChange={(event) => onAction(process.id, event.target.value as CorporateActionStatus)}>
          <option value="unknown">未知，待确认（仅暂算）</option><option value="none_confirmed">我确认不存在影响现金流或股数的公司行动</option><option value="present">存在分红、拆股、送股、配股等公司行动</option>
        </select></label>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <div><dt>买入成交额（不含费用）</dt><dd>{formatCents(cash.buy_cents)} 元</dd></div>
          <div><dt>卖出成交额（不含费用）</dt><dd>{formatCents(cash.sell_cents)} 元</dd></div>
          <div><dt>{cash.total_fee_cents === null ? `已知费用小计（${cash.missing_fee_count}笔缺失）` : "已录入费用合计"}</dt><dd>{formatCents(cash.known_fee_cents)} 元</dd></div>
          <div><dt>费用前盈亏（暂算）</dt><dd>{cash.gross_pnl_cents === null ? "不计算：未清仓或存在不支持的公司行动" : `${formatCents(cash.gross_pnl_cents)} 元`}</dd></div>
          <div><dt>现金净盈亏（暂算）</dt><dd>{cash.net_pnl_cents === null ? "未知 / 不计算：费用缺失、未清仓或公司行动限制" : `${formatCents(cash.net_pnl_cents)} 元`}</dd></div>
        </dl>
        <ul className="mt-3 space-y-1 text-xs leading-5 text-amber-900">{cash.limitations.map((text) => <li key={text}>{text}</li>)}</ul>
        <details className="mt-3 text-xs"><summary className="cursor-pointer text-teal-800">查看计算依赖</summary><p className="mt-2 break-all">交易ID：{cash.input_trade_ids.join("、")}<br />证据ID：{cash.dependency_evidence_ids.join("、")}</p></details>
      </article>;
    })}
  </div>;
}
