import { decimalUnits, tradeSchema, type Trade } from "./schema";

export type PositionProcess = {
  id: string; symbol: string; data_mode: Trade["data_mode"]; trades: Trade[];
  status: "closed" | "open"; quantity: bigint;
};
export type PositionIssue = { symbol: string; trade_id: string; row: number; code: "PENDING_ORDER" | "ORDER_CONFLICT" | "SELL_BEFORE_BUY" | "OVERSELL"; message: string };

// Derive from original trades; never repair negative positions using a later buy.
export function recognizePositions(input: Trade[]): { processes: PositionProcess[]; issues: PositionIssue[] } {
  const trades = input.map((trade) => tradeSchema.parse(trade));
  const groups = new Map<string, Trade[]>();
  for (const trade of trades) {
    const key = `${trade.data_mode}:${trade.symbol}`;
    groups.set(key, [...(groups.get(key) ?? []), trade]);
  }
  const processes: PositionProcess[] = [], issues: PositionIssue[] = [];
  for (const records of groups.values()) {
    const issueStart = issues.length;
    const ordered: Trade[] = [];
    const fail = (trade: Trade, code: PositionIssue["code"], message: string) => issues.push({ symbol: trade.symbol, trade_id: trade.trade_id, row: trade.source_row, code, message });
    const days = new Map<string, Trade[]>();
    for (const trade of records) {
      const sameDay = days.get(trade.trade_date) ?? [];
      sameDay.push(trade); days.set(trade.trade_date, sameDay);
    }
    for (const day of [...days.keys()].sort()) {
      const sameDay = days.get(day)!;
      const precise = sameDay.every((trade) => trade.trade_at !== null) && new Set(sameDay.map((trade) => Date.parse(trade.trade_at!))).size === sameDay.length;
      if (sameDay.some((trade) => !trade.order_confirmed) || (!precise && sameDay.length > 1 &&
          (sameDay.some((trade) => trade.same_day_order === null) || new Set(sameDay.map((trade) => trade.same_day_order)).size !== sameDay.length))) {
        fail(sameDay[0], "PENDING_ORDER", "成交顺序待确认，不能识别完整持仓过程。"); break;
      }
      sameDay.sort(precise ? (a, b) => Date.parse(a.trade_at!) - Date.parse(b.trade_at!) : (a, b) => (a.same_day_order ?? 0) - (b.same_day_order ?? 0));
      const explicit = sameDay.filter((trade) => trade.same_day_order !== null);
      const timed = sameDay.filter((trade) => trade.trade_at !== null);
      if ((precise && explicit.some((trade, i) => i > 0 && trade.same_day_order! <= explicit[i - 1].same_day_order!)) ||
          timed.some((trade, i) => i > 0 && Date.parse(trade.trade_at!) < Date.parse(timed[i - 1].trade_at!))) {
        fail(sameDay[0], "ORDER_CONFLICT", "确认的顺序与成交时间矛盾。"); break;
      }
      ordered.push(...sameDay);
    }
    if (issues.length > issueStart) continue;
    const completed: PositionProcess[] = [];
    let current: PositionProcess | null = null;
    for (const trade of ordered) {
      if (!current) {
        if (trade.side === "SELL") { fail(trade, "SELL_BEFORE_BUY", "零持仓时先卖出：可能缺少期初持仓或交易，拒绝识别，不补造买入。"); break; }
        current = { id: `position-${trade.trade_id}`, symbol: trade.symbol, data_mode: trade.data_mode, trades: [], status: "open", quantity: 0n };
      }
      const quantity = BigInt(trade.quantity);
      if (trade.side === "SELL" && quantity > current.quantity) {
        fail(trade, "OVERSELL", `卖出 ${quantity} 股超过已录入持仓 ${current.quantity} 股，拒绝识别；后续买入不能抵消此错误。`); break;
      }
      current.trades.push(trade);
      current.quantity += trade.side === "BUY" ? quantity : -quantity;
      if (current.quantity === 0n) { current.status = "closed"; completed.push(current); current = null; }
    }
    // A broken security history has no trustworthy complete process metrics.
    if (issues.length > issueStart) continue;
    processes.push(...completed, ...(current ? [current] : []));
  }
  processes.sort((a, b) => a.trades[0].trade_date.localeCompare(b.trades[0].trade_date) || a.symbol.localeCompare(b.symbol));
  return { processes, issues };
}

export type CorporateActionStatus = "unknown" | "none_confirmed" | "present";
const CENT_SCALE = 10_000n; // 6-decimal yuan inputs: 10,000 integer subunits per cent.
function roundedCents(value: bigint): bigint {
  const sign = value < 0n ? -1n : 1n;
  return sign * ((value * sign + CENT_SCALE / 2n) / CENT_SCALE);
}
export function formatCents(cents: bigint): string {
  const value = cents < 0n ? -cents : cents;
  return `${cents < 0n ? "-" : ""}${value / 100n}.${(value % 100n).toString().padStart(2, "0")}`;
}
export function calculateCash(process: PositionProcess, corporateActions: CorporateActionStatus = "unknown") {
  // Verify the complete input again; callers cannot mark an open or invalid history closed.
  const checked = recognizePositions(process.trades);
  const actual = checked.processes.length === 1 && !checked.issues.length ? checked.processes[0] : null;
  if (!actual || actual.id !== process.id) throw new Error("无效持仓过程不能计算盈亏。");
  let buy = 0n, sell = 0n, fees = 0n, missingFees = 0;
  for (const trade of actual.trades) {
    const amount = decimalUnits(trade.price) * BigInt(trade.quantity);
    if (trade.side === "BUY") buy += amount; else sell += amount;
    if (trade.fee === null) missingFees++; else fees += decimalUnits(trade.fee);
  }
  const allowed = actual.status === "closed" && corporateActions !== "present";
  return {
    buy_cents: roundedCents(buy), sell_cents: roundedCents(sell), known_fee_cents: roundedCents(fees), missing_fee_count: missingFees,
    total_fee_cents: missingFees ? null : roundedCents(fees),
    gross_pnl_cents: allowed ? roundedCents(sell - buy) : null,
    net_pnl_cents: allowed && !missingFees ? roundedCents(sell - buy - fees) : null,
    status: allowed ? "provisional" as const : "blocked" as const,
    input_trade_ids: actual.trades.map((trade) => trade.trade_id),
    dependency_evidence_ids: actual.trades.map((trade) => trade.evidence.evidence_id),
    limitations: ["仅依据已录入交易暂算；期初无持仓和交易无遗漏尚未确认，不是完整投资收益。",
      "买入额 B、卖出额 S 不含费用；费用前盈亏=S−B，现金净盈亏=S−B−全部实际费用。不推算费用、不按市价估计未卖出部分。",
      "金额以 BigInt 整数处理，保留不足一分的输入精度，汇总后四舍五入为整数分；展示两位小数。",
      corporateActions === "present" ? "存在分红、拆股、送股或配股等复杂公司行动，简化盈亏计算已阻止。" : corporateActions === "unknown" ? "公司行动未知，待确认；暂算未计分红、拆股等影响。" : "用户本次确认无公司行动；未独立核验。",
      ...(actual.status === "open" ? ["尚未清仓，不展示完整费用前/净盈亏；保留成交额、已知费用和当前股数。"] : []),
      ...(missingFees ? [`${missingFees} 笔费用未知，仅显示已知费用小计，净盈亏未知。`] : [])],
  };
}
