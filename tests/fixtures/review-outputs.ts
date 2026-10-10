import { bindingKeys, type Binding, type AInput, type BInput, type AOutput, type BOutput } from "../../src/lib/review/engine";

// Constructed, test-only responses. Never loaded by the production page.
export function validA(input: AInput): AOutput {
  const binding = Object.fromEntries(bindingKeys.map((key) => [key, input[key]])) as Binding;
  const evidence = input.evidence.find((e) => e.kind === "event") ?? input.evidence.find((e) => e.kind === "reason");
  return { ...binding, decision_assessment: { core_judgment: evidence ? "构造材料提供一项可检验的过程说明，尚未独立核验。" : "缺少可用事前材料，不能判断支持程度。",
    evidence_support: evidence ? [{ finding_id: "a-observation", statement: "构造原文记录了一项待核验说明。", finding_type: "supported_observation", evidence_refs: [{ evidence_id: evidence.evidence_id, field_path: evidence.kind === "event" ? "/excerpt" : "/judgment", usage: "prior_basis" }], qualification: "只说明原文存在，不证明效果或用户实际阅读。" }] : [], untested_assumptions: [] },
    process_findings: [], missing_information: [{ information: "缺少独立核验材料。", impact: "不能确认说明的真实性或效果。" }], questions_to_verify: ["当时是否明确记录失效条件？"], limitations: ["构造演示，来源及效果未独立核验。"],
  } as AOutput;
}
export function validB(input: BInput): BOutput {
  const binding = Object.fromEntries(bindingKeys.map((key) => [key, input[key]])) as Binding;
  const trade = input.evidence.find((e) => e.kind === "trade")!;
  return { ...binding, summary: "构造执行记录与程序现金口径可查，原因尚不能确定。",
    fact_findings: [{ finding_id: "b-execution", statement: "本段有用户录入或构造的执行记录。", decision_trade_id: input.decision_trade_id, evidence_refs: [{ evidence_id: trade.evidence_id, field_path: "/side", usage: "execution_fact" }], metric_ids: ["gross_pnl"], qualification: "仅记录事实和暂算口径，不代表真实供应商数据或完整收益。", alternative_explanations: [] }],
    explanation_hypotheses: [], behavior_hypotheses: [], uncertainties: [{ finding_id: "b-gap", statement: "缺少独立核验材料，不能确定结果的原因。", decision_trade_id: null, evidence_refs: [], metric_ids: [], qualification: "未进行因果识别或心理诊断。", alternative_explanations: [] }],
    learning_items: [{ learning_id: "learning-question", question: "决策前是否记录可检验的失效条件？", why: "有助于区分执行记录与事后解释。", required_evidence: ["当时原始理由与版本材料"], related_finding_ids: ["b-execution"] }],
  } as BOutput;
}
