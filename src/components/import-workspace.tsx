"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { loadDemo } from "@/lib/demo";
import { type DataMode, type Dataset, type Trade } from "@/lib/domain/schema";
import { adoptPreview, parseTradesCsv, type Preview } from "@/lib/import/csv";
import { decodeDataset, saveDataset, STORAGE_KEY } from "@/lib/storage/dataset-store";
import EvidenceDetails from "./evidence-details";
import EvidenceTimeline from "./evidence-timeline";
import ManualReview from "./manual-review";
import ReasonInput from "./reason-input";
import EventInput from "./event-input";
import { recognizePositions } from "@/lib/domain/positions";

const button = "rounded-lg bg-teal-800 px-4 py-2 text-sm font-medium text-white hover:bg-teal-900 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500";
const panel = "rounded-2xl border border-slate-200 bg-white p-6 sm:p-7";
const links = [
  ["trades-template.csv", "下载空白模板"], ["demo-trades.csv", "两笔构造交易 CSV"],
  ["negative-quantity.csv", "负数量错误案例"], ["missing-fee.csv", "费用缺失案例"], ["demo-case.json", "下载完整构造案例 JSON"],
];

function TradeTable({ trades }: { trades: Trade[] }) {
  return <div className="mt-4 overflow-x-auto">
    <table className="w-full min-w-[720px] text-left text-sm">
      <caption className="sr-only">交易记录，数量单位股，价格单位元每股，费用单位元</caption>
      <thead><tr className="border-b text-slate-500">{["CSV行", "标的", "成交时间（上海）", "方向", "数量（股）", "价格（元/股）", "费用（元）"].map((title) => <th key={title} scope="col" className="p-2 font-medium">{title}</th>)}</tr></thead>
      <tbody>{trades.map((trade) => <tr key={trade.trade_id} className="border-b border-slate-100 align-top">
        <td className="p-2">{trade.source_row}</td><td className="p-2">{trade.symbol}<br />{trade.name}</td>
        <td className="p-2">{trade.trade_at ?? `${trade.trade_date}（仅日期）`}<EvidenceDetails record={trade} /></td>
        <td className="p-2">{trade.side === "BUY" ? "买入" : "卖出"}</td><td className="p-2">{trade.quantity}</td>
        <td className="p-2">{trade.price}</td><td className="p-2">{trade.fee ?? "未知（未补零）"}</td>
      </tr>)}</tbody>
    </table>
  </div>;
}

export default function ImportWorkspace() {
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [ready, setReady] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("正在恢复本地数据…");
  const [mode, setMode] = useState<DataMode>("real");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [excluded, setExcluded] = useState<number[]>([]);
  const [duplicateConfirmed, setDuplicateConfirmed] = useState<string[]>([]);
  const [orderConfirmed, setOrderConfirmed] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const expected = useRef<string | null>(null);
  const generation = useRef(0);
  useEffect(() => {
    let alive = true;
    void Promise.resolve().then(() => {
      if (!alive) return;
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        expected.current = raw;
        if (raw) setDataset(decodeDataset(raw));
        setStatus(raw ? "已恢复本地数据" : "暂无本地数据");
      } catch { setStatus("本地数据读取失败或损坏，原记录未被覆盖。请先备份原存储后处理。"); setBlocked(true); }
      setReady(true);
    });
    const onStorage = (event: StorageEvent) => {
      if ((event.key === STORAGE_KEY || event.key === null) && event.newValue !== expected.current) {
        setBlocked(true); setStatus("另一标签页已修改数据，已暂停写入，请刷新后继续。");
      }
    };
    window.addEventListener("storage", onStorage);
    return () => { alive = false; window.removeEventListener("storage", onStorage); generation.current = -1; };
  }, []);

  async function persist(next: Dataset): Promise<boolean> {
    if (!ready || blocked || saving) return false;
    setSaving(true); setStatus("保存中…");
    try {
      const save = () => { expected.current = saveDataset(localStorage, next, expected.current); };
      if (navigator.locks) await navigator.locks.request(STORAGE_KEY, save); else save();
      setDataset(next); setStatus("已保存到当前浏览器（不会跨设备同步）");
      return true;
    } catch (error) {
      const conflict = error instanceof Error && error.message.includes("另一标签页");
      if (conflict) setBlocked(true); else setDataset(next);
      setStatus(conflict ? "另一标签页已修改数据，未覆盖原记录。请刷新后继续。" : "保存失败：数据仅保留在本页内存，刷新会丢失。请下载当前数据备份。");
      return false;
    } finally { setSaving(false); }
  }

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file || !ready || blocked) return;
    const current = ++generation.current;
    setBusy(true); setPreview(null); setExcluded([]); setDuplicateConfirmed([]); setOrderConfirmed([]);
    try {
      const bytes = file.size > 2 * 1024 * 1024 ? new Uint8Array(2 * 1024 * 1024 + 1) : new Uint8Array(await file.arrayBuffer());
      const parsed = parseTradesCsv(bytes, file.name, mode);
      if (current === generation.current) setPreview(parsed);
    } catch { if (current === generation.current) setStatus("文件读取失败，当前数据保持不变。"); }
    finally { if (current === generation.current) setBusy(false); }
  }

  function exportCurrent() {
    if (!dataset) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(dataset, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "investment-fields-backup.json"; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const disabled = !ready || blocked || saving || busy;
  const decisionsReady = preview && !preview.errors.length && preview.duplicates.every((group) => duplicateConfirmed.includes(group.key)) && preview.orders.every((group) => orderConfirmed.includes(group.key));
  let candidate: Dataset | null = null, positionError = "";
  if (decisionsReady) {
    try { candidate = adoptPreview(preview, excluded, duplicateConfirmed, orderConfirmed); }
    catch (error) { positionError = error instanceof Error ? error.message : "持仓检查失败。"; }
  }
  const canImport = candidate !== null;

  return <div className="space-y-6">
    <section id="import" aria-labelledby="import-title" className={panel}>
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="import-title" className="text-xl font-semibold">01 导入交易与构造案例</h2><span className="text-sm text-teal-800">字段与导入已实现</span></div>
      <p className="mt-3 text-sm leading-6 text-slate-600">数量按股、价格按元/股、费用按元。仅支持 UTF-8 CSV，最大2MB、5000条；先预览，确认后整批导入。</p>
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2">{links.map(([filename, label]) => <a key={filename} href={`/samples/${filename}`} download className="text-sm text-teal-800 underline underline-offset-4">{label}</a>)}</div>
      <p className="mt-3 text-xs leading-5 text-slate-500">案例文件均为 synthetic，不对应真实公司新闻。完整 JSON 是固定复用素材；通用 JSON 备份恢复尚未实现。</p>
      <p className="mt-3 rounded bg-teal-50 p-3 text-sm text-teal-900">构造演示入口：一键载入包含交易、理由、事件和日线的固定案例，可切换决策查看分类。示例CSV仅含交易，不会自动补充证据；载入示例不会把真实行情状态改为可用。</p>
      <div className="mt-5 flex flex-wrap items-end gap-4">
        <fieldset disabled={disabled} className="rounded-lg border border-slate-200 p-3 text-sm"><legend className="px-1">CSV 导入模式</legend>
          {[["real", "真实交易（用户提供，未验证）"], ["constructed", "构造 CSV（仅用于演示）"]].map(([value, label]) => <label key={value} className="mr-4 inline-flex gap-2"><input type="radio" name="data-mode" value={value} checked={mode === value} onChange={() => { setMode(value as DataMode); setPreview(null); generation.current++; }} />{label}</label>)}
        </fieldset>
        <div><label htmlFor="csv-file" className="mb-2 block text-sm font-medium">上传 CSV</label><input id="csv-file" type="file" accept=".csv,text/csv" disabled={disabled} onChange={upload} className="max-w-full text-sm" /></div>
        <button type="button" disabled={disabled} className={button} onClick={() => {
          if (dataset && !window.confirm("载入构造案例将替换当前字段数据，不合并。是否继续？")) return;
          setPreview(null); void persist(loadDemo());
        }}>一键载入构造案例</button>
      </div>
      <p role="status" aria-live="polite" className="mt-4 text-sm text-slate-700">{busy ? "正在读取和校验 CSV…" : status}</p>
      {dataset && <button type="button" onClick={exportCurrent} className="mt-2 text-sm text-teal-800 underline">下载当前字段数据备份</button>}

      {preview && <div className="mt-6 border-t border-slate-200 pt-5">
        <h3 className="font-semibold">导入预览：{preview.filename}</h3>
        <p className="mt-2 text-sm">模式：{preview.mode === "constructed" ? "构造演示，用户上传 user_provided / unverified" : "用户提供，真实性未验证"}；有效格式记录 {preview.trades.length} 条；股票 {new Set(preview.trades.map((trade) => trade.symbol)).size} 只；忽略空白记录 {preview.ignored_blank_rows} 条。</p>
        <p className="mt-2 text-sm text-slate-600">顺序确认后检查持仓过程，拒绝先卖后买和超额卖出。确认导入会替换当前数据，不合并历史持仓。</p>
        {positionError && <p role="alert" className="mt-3 rounded bg-red-50 p-3 text-sm text-red-900">{positionError}</p>}
        {candidate && <p className="mt-2 text-sm">拟识别 {recognizePositions(candidate.trades).processes.length} 个持仓过程（其中未清仓 {recognizePositions(candidate.trades).processes.filter((process) => process.status === "open").length} 个）；完整性仍待确认。</p>}
        {[...preview.errors, ...preview.warnings].length > 0 && <ul className="mt-3 space-y-2 text-sm" aria-label="CSV 校验信息">{[...preview.errors, ...preview.warnings].map((issue, index) => <li key={`${issue.row}-${issue.field}-${index}`} className={preview.errors.includes(issue) ? "rounded bg-red-50 p-3 text-red-900" : "rounded bg-amber-50 p-3 text-amber-900"}>
          {preview.errors.includes(issue) ? "错误" : "警告"} · 第{issue.row}行 · {issue.field}：{issue.message}（{issue.code}）<br />建议：{issue.suggestion}
        </li>)}</ul>}
        {preview.duplicates.map((group) => <fieldset key={group.key} className="mt-3 rounded border p-3 text-sm"><legend>疑似重复：第 {group.rows.join("、")} 行</legend>
          <p>相同记录可能是真实多笔成交。选择要排除的行；不选择即保留全部。</p>
          {group.rows.map((row) => <label key={row} className="mr-4 inline-flex gap-2"><input type="checkbox" checked={excluded.includes(row)} onChange={(event) => { setExcluded(event.target.checked ? [...excluded, row] : excluded.filter((value) => value !== row)); setDuplicateConfirmed(duplicateConfirmed.filter((key) => key !== group.key)); }} />排除第{row}行</label>)}
          <label className="mt-2 flex gap-2"><input type="checkbox" checked={duplicateConfirmed.includes(group.key)} onChange={(event) => setDuplicateConfirmed(event.target.checked ? [...duplicateConfirmed, group.key] : duplicateConfirmed.filter((key) => key !== group.key))} />确认本组保留 / 排除决定</label>
        </fieldset>)}
        {preview.orders.map((group) => <label key={group.key} className="mt-3 flex gap-2 rounded bg-amber-50 p-3 text-sm"><input type="checkbox" checked={orderConfirmed.includes(group.key)} onChange={(event) => setOrderConfirmed(event.target.checked ? [...orderConfirmed, group.key] : orderConfirmed.filter((key) => key !== group.key))} />{group.key}：候选顺序为第 {group.rows.join(" → ")} 行。我确认此为实际先后；如不符请修改 CSV 的 same_day_order 后重新上传。确认顺序不会补造成交时刻。</label>)}
        <TradeTable trades={preview.trades} />
        <button type="button" className={`${button} mt-4`} disabled={disabled || !canImport} onClick={() => {
          if (dataset && !window.confirm("导入将整体替换当前字段数据，不合并历史持仓。是否继续？")) return;
          try { if (!candidate) throw new Error("持仓检查未通过。"); void persist(candidate); setPreview(null); }
          catch (error) { setStatus(error instanceof Error ? error.message : "导入失败，当前数据保持不变。"); }
        }}>确认整批导入{dataset ? "并替换当前数据" : ""}</button>
      </div>}
      {dataset && <div className="mt-6 border-t pt-4">
        <p className="rounded bg-amber-50 p-3 text-sm text-amber-900">{dataset.data_mode === "constructed" ? "构造演示：不对应真实股票或新闻。内置素材为 synthetic；用户上传或录入为 user_provided / unverified，另保留构造标记。" : "用户提供的交易记录，真实性未自动验证；没有自动补充真实行情、事件或理由。"}</p>
        <h3 className="mt-4 font-semibold">当前交易：{dataset.label}</h3><TradeTable trades={dataset.trades} />
        {dataset.trades.some((trade) => trade.fee === null) && <p className="mt-3 text-sm text-amber-900">存在未知费用；只可显示费用前盈亏，净盈亏未知。详见时间线中的现金口径。</p>}
      </div>}
      {dataset && <ReasonInput key={dataset.case_id} dataset={dataset} disabled={disabled} onSave={persist} />}
      {dataset ? <EventInput key={`event-${dataset.case_id}`} dataset={dataset} disabled={disabled} onSave={persist} /> : <p className="mt-5 text-sm">用户上传证据入口：先导入交易CSV，再上传事件原文TXT并填写来源与首次发布时间；理由可在对应表单输入。</p>}
    </section>

    <EvidenceTimeline key={dataset?.case_id ?? "empty"} dataset={dataset} />
    <ManualReview dataset={dataset} disabled={disabled} />
  </div>;
}
