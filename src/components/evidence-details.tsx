import type { EvidenceRecord } from "@/lib/domain/timeline";
import { timeLabels, type Classification } from "@/lib/domain/visibility";

export default function EvidenceDetails({ record, classification }: { record: EvidenceRecord; classification?: Classification }) {
  const { evidence, ...fields } = record;
  const publicDate = "published_date" in record ? record.published_date : null;
  const publicAt = "published_at" in record ? record.published_at : null;
  const excerpt = "source_excerpt" in record ? record.source_excerpt : "excerpt" in record ? record.excerpt : null;
  const sourceUrl = "source_url" in record ? record.source_url : null;
  return <details className="mt-3 min-w-0 text-sm leading-6 text-slate-600">
    <summary className="cursor-pointer font-medium text-teal-800 focus-visible:outline-2 focus-visible:outline-teal-700">查看来源详情</summary>
    <div className="mt-3 space-y-2 rounded-lg border border-slate-200 bg-white p-4 [overflow-wrap:anywhere]">
      <p className="font-medium">{evidence.source_type === "synthetic" ? "synthetic 构造数据：不对应真实公司、交易或新闻" : record.is_constructed ? "用户提供的构造材料：不对应真实公司、交易或公告；未验证" : "用户提供 / 供应商记录，来源标签不等于真实性证明"}</p>
      <p>证据 ID：{evidence.evidence_id}</p>
      <p>来源类型：{evidence.source_type}；质量：{evidence.quality.status}</p>
      <p>来源：{evidence.source_name}；位置：{evidence.source_reference}</p>
      {sourceUrl && <a className="text-teal-800 underline" href={sourceUrl} target="_blank" rel="noopener noreferrer">打开用户提供的原文链接（未自动核验）</a>}
      <p>首次发布时间：{"published_date" in record ? publicAt ?? (publicDate ? `${publicDate}（仅日期，没有小时）` : "未知，未提供") : "未提供独立的公开发布时间"}</p>
      <p>首次可得时间：{evidence.first_available.at ?? (evidence.first_available.date ? `${evidence.first_available.date}（仅日期，没有小时）` : "未知，未提供")}；精度：{evidence.first_available.precision}</p>
      <p>时间依据：{evidence.first_available.basis}</p>
      <p>取数时间：{evidence.fetched_at ?? "未取数（本地输入/导入不冒充供应商取数）"}；时区：{evidence.timezone}</p>
      <p>{classification ? `时间分类：${timeLabels[classification.time_class]}；${classification.explanation}` : "时间分类请在时间线选定决策交易后查看；分类随决策时点变化。"}</p>
      <p>质量说明：{evidence.quality.notes.join("；") || "未提供"}</p>
      <h4 className="font-medium text-slate-900">原始摘录</h4>
      <p className="whitespace-pre-wrap">{excerpt || "未提供原文摘录；以下保留已采用字段，不自动补写文本。"}</p>
      <h4 className="font-medium text-slate-900">原始字段 / 已采用值</h4>
      <p className="text-xs">CSV 显示规范化后采用的记录，原始位置按文件行号与字段定位；不声称保存了完整原文件。</p>
      <pre className="max-h-64 overflow-auto rounded bg-slate-50 p-3 text-xs">{JSON.stringify(fields, null, 2)}</pre>
      <h4 className="font-medium text-slate-900">来源字段定位与单位</h4>
      <pre className="max-h-48 overflow-auto rounded bg-slate-50 p-3 text-xs">{JSON.stringify({ source_fields: evidence.source_fields, units: evidence.units }, null, 2)}</pre>
    </div>
  </details>;
}
