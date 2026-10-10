import { parse } from "csv-parse/browser/esm/sync";
import { datasetSchema, decimalUnits, tradeSchema, type DataMode, type Dataset, type Trade } from "../domain/schema";
import { recognizePositions } from "../domain/positions";

export const HEADERS = ["symbol", "name", "trade_date", "trade_time", "side", "quantity", "price", "fee", "same_day_order"];
export type ImportIssue = { row: number; field: string; code: string; message: string; suggestion: string };
export type Preview = {
  batch_id: string; imported_at: string; filename: string; mode: DataMode; trades: Trade[];
  errors: ImportIssue[]; warnings: ImportIssue[]; ignored_blank_rows: number;
  duplicates: { key: string; rows: number[] }[];
  orders: { key: string; rows: number[] }[];
};
type CsvRecord = { record: string[]; raw: string; info: { lines: number } };

export function parseTradesCsv(bytes: Uint8Array, filename: string, mode: DataMode, options: { now?: string; id?: () => string } = {}): Preview {
  const makeId = options.id ?? (() => crypto.randomUUID());
  const preview: Preview = { batch_id: makeId(), imported_at: options.now ?? new Date().toISOString(), filename, mode,
    trades: [], errors: [], warnings: [], ignored_blank_rows: 0, duplicates: [], orders: [] };
  const issue = (row: number, field: string, code: string, message: string, suggestion = "请修正 CSV 后重新上传。") =>
    preview.errors.push({ row, field, code, message, suggestion });
  if (!/\.csv$/i.test(filename)) { issue(0, "file", "FILE_EXTENSION", "仅支持 .csv 文件"); return preview; }
  if (bytes.byteLength > 2 * 1024 * 1024) { issue(0, "file", "FILE_SIZE", "文件超过2MB上限"); return preview; }
  let text;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { issue(0, "file", "ENCODING", "无法可靠解码 UTF-8", "请将文件转为 UTF-8 后上传。"); return preview; }
  let records: CsvRecord[];
  try { records = parse(text, { bom: true, info: true, raw: true, relax_column_count: true, skip_empty_lines: false }) as unknown as CsvRecord[]; }
  catch { issue(0, "file", "CSV_SYNTAX", "CSV 引号或结构错误", "请使用标准双引号转义，并下载模板核对。"); return preview; }
  const header = records.shift()?.record.map((field) => field.trim());
  if (!header || HEADERS.some((field) => !header.includes(field)) || new Set(header).size !== header.length || header.some((field) => !HEADERS.includes(field))) {
    issue(1, "header", "CSV_HEADER", "表头缺失、重复或有未知字段", "请使用下载模板中的九个标准字段。"); return preview;
  }
  let rowCursor = 2;
  let count = 0;
  for (const entry of records) {
    const row = rowCursor;
    rowCursor += (entry.raw.match(/\r\n|\n|\r/g) ?? []).length || 1;
    if (entry.record.every((field) => field.trim() === "")) { preview.ignored_blank_rows++; continue; }
    if (++count > 5000) { issue(row, "file", "ROW_LIMIT", "交易记录超过5000条上限"); break; }
    if (entry.record.length !== header.length) { issue(row, "record", "COLUMN_COUNT", "字段数量与表头不一致"); continue; }
    const raw = Object.fromEntries(header.map((field, index) => [field, entry.record[index].trim()]));
    const symbol = raw.symbol.toUpperCase();
    if (mode === "constructed" ? symbol !== "DEMO001" : symbol === "DEMO001") {
      issue(row, "symbol", "MODE_MISMATCH", "真实与构造导入入口不能混用", mode === "constructed" ? "构造入口仅接受 DEMO001。" : "DEMO001 请使用构造入口，仅用于演示。"); continue;
    }
    if (raw.trade_time && !/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(raw.trade_time)) {
      issue(row, "trade_time", "TIME_FORMAT", "时间必须为 HH:mm:ss，不补造小时"); continue;
    }
    const tradeAt = raw.trade_time ? `${raw.trade_date}T${raw.trade_time}+08:00` : null;
    const recordId = makeId();
    const validInteger = (value: string) => /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value));
    const candidate = {
      trade_id: recordId, batch_id: preview.batch_id, source_row: row, symbol, name: raw.name,
      trade_date: raw.trade_date, trade_at: tradeAt, time_precision: tradeAt ? "datetime" : "date",
      side: raw.side.toUpperCase(), quantity: validInteger(raw.quantity) ? Number(raw.quantity) : 0,
      price: raw.price, fee: raw.fee === "" ? null : raw.fee,
      same_day_order: raw.same_day_order === "" ? null : validInteger(raw.same_day_order) ? Number(raw.same_day_order) : 0,
      order_confirmed: false, data_mode: mode, is_constructed: mode === "constructed", created_at: preview.imported_at, updated_at: preview.imported_at,
      evidence: {
        evidence_id: `evidence-${recordId}`, source_type: "user_provided",
        source_name: mode === "constructed" ? "构造 CSV（仅用于演示）" : "用户导入 CSV（真实性未自动验证）",
        source_reference: `${filename}:row=${row}`, source_fields: Object.fromEntries(HEADERS.map((field) => [field, `CSV第${row}行/${field}`])),
        units: { quantity: "股", price: "元/股", fee: "元" }, timezone: "Asia/Shanghai",
        first_available: { date: null, at: null, precision: "unknown", basis: "CSV 未提供原记录首次可得时间；成交时间和当前导入时间不作为其证明" },
        fetched_at: null, quality: { status: "unverified",
          notes: [mode === "constructed" ? "用户提供的构造材料：不对应真实公司或交易，未验证" : "用户输入不是真实性证明", ...(raw.fee === "" ? ["费用未知，不补零或推算费用"] : [])] },
      },
    };
    const parsed = tradeSchema.safeParse(candidate);
    if (!parsed.success) {
      for (const error of parsed.error.issues) issue(row, error.path.join("."), "SCHEMA_INVALID", error.message);
      continue;
    }
    preview.trades.push(parsed.data);
    if (parsed.data.fee === null) preview.warnings.push({ row, field: "fee", code: "FEE_UNKNOWN", message: "费用缺失，保留未知；净盈亏与含费用收益率不可计算", suggestion: "可补充账单中的实际总费用，不自动推算。" });
  }
  if (count === 0) issue(0, "file", "EMPTY_FILE", "没有交易记录");
  const groups = new Map<string, Trade[]>();
  const dayGroups = new Map<string, Trade[]>();
  for (const trade of preview.trades) {
    const key = JSON.stringify([trade.symbol, trade.trade_date, trade.trade_at, trade.time_precision, trade.side, trade.quantity, decimalUnits(trade.price).toString(), trade.fee === null ? null : decimalUnits(trade.fee).toString()]);
    groups.set(key, [...(groups.get(key) ?? []), trade]);
    const day = `${trade.symbol}:${trade.trade_date}`;
    dayGroups.set(day, [...(dayGroups.get(day) ?? []), trade]);
  }
  for (const trades of groups.values()) {
    if (trades.length > 1) preview.duplicates.push({ key: trades.map((trade) => trade.source_row).join(","), rows: trades.map((trade) => trade.source_row) });
  }
  for (const [key, trades] of dayGroups) {
    const orders = trades.map((trade) => trade.same_day_order).filter((order) => order !== null);
    if (new Set(orders).size !== orders.length) issue(trades[0].source_row, "same_day_order", "ORDER_DUPLICATE", "同股票同日的 same_day_order 不能重复");
    const precise = trades.every((trade) => trade.trade_at !== null) && new Set(trades.map((trade) => trade.trade_at)).size === trades.length;
    if (precise) {
      const timed = [...trades].sort((a, b) => Date.parse(a.trade_at!) - Date.parse(b.trade_at!));
      const explicit = timed.filter((trade) => trade.same_day_order !== null);
      if (explicit.some((trade, index) => index > 0 && trade.same_day_order! <= explicit[index - 1].same_day_order!)) {
        issue(trades[0].source_row, "same_day_order", "ORDER_CONFLICT", "同日顺序与明确成交时间矛盾");
      }
    } else if (trades.length > 1) {
      const ordered = trades.every((trade) => trade.same_day_order !== null) ? [...trades].sort((a, b) => a.same_day_order! - b.same_day_order!) : trades;
      const timed = ordered.filter((trade) => trade.trade_at !== null);
      if (timed.some((trade, index) => index > 0 && Date.parse(trade.trade_at!) < Date.parse(timed[index - 1].trade_at!))) {
        issue(trades[0].source_row, "same_day_order", "ORDER_CONFLICT", "候选同日顺序与已知成交时间矛盾，请填写正确的 same_day_order");
      }
      preview.orders.push({ key, rows: ordered.map((trade) => trade.source_row) });
    }
  }
  return preview;
}

export function adoptPreview(preview: Preview, excludedRows: number[], duplicateConfirmed: string[], orderConfirmed: string[]): Dataset {
  if (preview.errors.length || preview.duplicates.some((group) => !duplicateConfirmed.includes(group.key)) || preview.orders.some((group) => !orderConfirmed.includes(group.key))) {
    throw new Error("仍有错误、疑似重复决定或同日顺序待确认。");
  }
  const trades = preview.trades.filter((trade) => !excludedRows.includes(trade.source_row)).map((trade) => {
    const group = preview.orders.find((order) => order.rows.includes(trade.source_row));
    return { ...trade, order_confirmed: true, same_day_order: group ? group.rows.indexOf(trade.source_row) + 1 : trade.same_day_order };
  });
  if (!trades.length) throw new Error("排除后没有可导入的交易。");
  const positions = recognizePositions(trades);
  if (positions.issues.length) throw new Error(positions.issues.map((issue) => `${issue.symbol} 第${issue.row}行 ${issue.code}：${issue.message}`).join("；"));
  // This stage explicitly replaces the current dataset; it never silently merges episodes.
  return datasetSchema.parse({ schema_version: "1.0", dataset_version: "fields-import-v1", case_id: `import-${preview.batch_id}`,
    label: preview.filename, data_mode: preview.mode, created_at: preview.imported_at, updated_at: preview.imported_at,
    trades, reasons: [], events: [], market_bars: [], active_reason_id: null,
    import_batches: [{ batch_id: preview.batch_id, filename: preview.filename, imported_at: preview.imported_at, data_mode: preview.mode,
      adopted_rows: trades.map((trade) => trade.source_row), excluded_rows: excludedRows, ignored_blank_rows: preview.ignored_blank_rows,
      duplicate_decisions: preview.duplicates.map((group) => ({ group: group.key, excluded_rows: group.rows.filter((row) => excludedRows.includes(row)) })), order_confirmations: orderConfirmed }],
  });
}
