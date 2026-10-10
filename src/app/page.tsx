import ImportWorkspace from "@/components/import-workspace";
import { DATA_SOURCE_STATUS } from "@/lib/data-source-status";

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-10 focus:bg-white focus:p-4">跳转到主要内容</a>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-5">
          <p className="text-lg font-semibold">投资决策复盘与学习</p>
          <span className="rounded-full bg-teal-50 px-3 py-1 text-sm text-teal-900">导入与证据工作台</span>
        </div>
      </header>
      <main id="main-content" className="mx-auto max-w-6xl px-6 py-10">
        <h1 className="text-3xl font-semibold sm:text-4xl">回看一次决策，留下下一次的思考。</h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600">导入交易、补充理由，核对持仓过程、现金口径和决策时点的可知证据。程序负责分类与计算；通过手动复制任务和导入JSON完成两阶段辅助复盘。</p>
        <div aria-label="真实数据接入状态" data-source-status={DATA_SOURCE_STATUS.status} className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
          <p className="font-semibold">真实行情：unavailable（暂不可用）</p><p>{DATA_SOURCE_STATUS.explanation}</p><p>{DATA_SOURCE_STATUS.attempted}</p><p>{DATA_SOURCE_STATUS.result}</p>
          <p>当前仅提供synthetic构造演示和用户提供证据；真实历史快照未确认可用。AI自动调用、新闻/指数/日历/公司行动等接入尚未实现，不自动尝试其他接口。</p>
        </div>
        <p className="mt-3 text-sm text-slate-600">AI 自动调用：未接入 · 字段数据：仅保存在当前浏览器</p>
        <nav aria-label="复盘区域导航" className="my-6 flex flex-wrap gap-3">
          {[["import", "01 导入"], ["timeline", "02 时间线"], ["ai-review", "03 AI复盘"], ["checklist", "04 学习清单"]].map(([id, title]) => <a key={id} href={`#${id}`} className="rounded-lg px-3 py-2 text-sm text-teal-800 hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-teal-700">{title}</a>)}
        </nav>
        <ImportWorkspace />
        <footer className="mt-8 border-t border-slate-200 pt-5 text-sm leading-6 text-slate-600">
          <p>本产品用于记录和复盘历史决策。AI 解释可能存在错误，请结合原始证据核验。</p>
          <p>不提供确定性涨跌预测、收益承诺或直接买卖建议。</p>
        </footer>
      </main>
    </div>
  );
}
