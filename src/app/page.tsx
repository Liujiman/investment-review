import ImportWorkspace from "@/components/import-workspace";

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
        <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600">导入交易、补充理由，在统一时间线核对记录与来源。时间分类待计算；复盘报告和学习清单尚未生成。</p>
        <p className="mt-4 text-sm text-slate-600">真实行情：页面未接入 · AI 自动调用：未接入 · 字段数据：仅保存在当前浏览器</p>
        <nav aria-label="复盘区域导航" className="my-6 flex flex-wrap gap-3">
          {[["import", "01 导入"], ["timeline", "02 时间线"], ["ai-review", "03 AI复盘"], ["checklist", "04 学习清单"]].map(([id, title]) => <a key={id} href={`#${id}`} className="rounded-lg px-3 py-2 text-sm text-teal-800 hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-teal-700">{title}</a>)}
        </nav>
        <ImportWorkspace />
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          {[["ai-review", "03 AI复盘", "尚未生成复盘报告", "两阶段证据包、JSON 导入和报告校验尚未实现。没有调用真实模型，不展示分析成功或未经核验的结论。"], ["checklist", "04 学习清单", "尚未生成清单", "尚无可核验的学习条目。清单编辑、保存与下一次决策尚未实现，不会自动填写学习结论。"]].map(([id, title, state, description]) => <section key={id} id={id} aria-labelledby={`${id}-title`} className="rounded-2xl border border-slate-200 bg-white p-6">
            <h2 id={`${id}-title`} className="text-xl font-semibold">{title}</h2><h3 className="mt-4 font-medium">{state}</h3><p className="mt-3 text-sm leading-6 text-slate-600">{description}</p><span className="mt-4 inline-block rounded bg-slate-100 px-3 py-1 text-sm text-slate-500">未实现 · 未生成</span>
          </section>)}
        </div>
        <footer className="mt-8 border-t border-slate-200 pt-5 text-sm leading-6 text-slate-600">
          <p>本产品用于记录和复盘历史决策。AI 解释可能存在错误，请结合原始证据核验。</p>
          <p>不提供确定性涨跌预测、收益承诺或直接买卖建议。</p>
        </footer>
      </main>
    </div>
  );
}
