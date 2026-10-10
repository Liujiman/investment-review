import { z } from "zod";
import { REVIEW_KEY, type Ledger, type AInput, type BInput, type AOutput, type BOutput, verifyHash, validateOutput } from "./engine";
import { validateContract } from "./json";

const ledgerShape = z.strictObject({ version: z.literal("manual-review-v1"), dataset_fingerprint: z.string().regex(/^[a-f0-9]{64}$/), entries: z.array(z.strictObject({
  episode_id: z.string().min(1).max(160), process_id: z.string().min(1), revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  confirmation: z.strictObject({ opening_zero: z.boolean(), complete: z.boolean(), no_actions: z.boolean(), scope: z.boolean(), evidence_ids: z.array(z.string()) }),
  packages: z.array(z.unknown()).max(40), results: z.array(z.strictObject({ package_id: z.string(), raw: z.string(), output: z.unknown(), imported_at: z.iso.datetime({ offset: true }) })).max(40),
})).max(100) });
const checkSize = (raw: string) => { if (new TextEncoder().encode(raw).byteLength > 8 * 1024 * 1024) throw new Error("复盘历史超过8MiB，请先下载备份；不会删除旧快照。"); };
export async function decodeReview(raw: string): Promise<Ledger> {
  checkSize(raw); const parsed = ledgerShape.parse(JSON.parse(raw));
  const ids = new Set<string>();
  for (const entry of parsed.entries) {
    if (ids.has(entry.episode_id)) throw new Error("复盘过程ID重复"); ids.add(entry.episode_id);
    const packageIds = new Set<string>();
    for (const value of entry.packages) {
      const input = value as AInput | BInput;
      if (!input || !["prior_assessment", "outcome_review"].includes(input.stage)) throw new Error("复盘包阶段不合法");
      validateContract(input.stage === "prior_assessment" ? "A_input" : "B_input", input); await verifyHash(input);
      if (input.episode_id !== entry.episode_id || packageIds.has(input.package_id)) throw new Error("复盘包归属或ID不合法");
      packageIds.add(input.package_id);
    }
    const resultIds = new Set<string>();
    for (const result of entry.results) {
      const input = (entry.packages as (AInput | BInput)[]).find((p) => p.package_id === result.package_id);
      if (!input || resultIds.has(result.package_id)) throw new Error("报告没有有效包或存在重复"); resultIds.add(result.package_id);
      const output = validateOutput(result.raw, input);
      if (JSON.stringify(output) !== JSON.stringify(result.output)) throw new Error("冻结JSON与存储结果不一致");
    }
    for (const value of entry.packages) {
      const b = value as BInput;
      if (b.stage !== "outcome_review") continue;
      const a = (entry.packages as (AInput | BInput)[]).find((p) => p.package_id === b.prior_package_id);
      const result = entry.results.find((r) => r.package_id === b.prior_package_id);
      if (!a || !result || a.stage !== "prior_assessment" || a.input_hash !== b.prior_input_hash || JSON.stringify(result.output as AOutput | BOutput) !== JSON.stringify(b.prior_assessment)) throw new Error("B缺少原冻结A绑定");
    }
  }
  return parsed as Ledger;
}
export function saveReview(storage: Pick<Storage, "getItem" | "setItem">, ledger: Ledger, expected: string | null): string {
  ledgerShape.parse(ledger); const raw = JSON.stringify(ledger); checkSize(raw);
  if (storage.getItem(REVIEW_KEY) !== expected) throw new Error("另一标签页修改复盘记录，本次未覆盖，请刷新。");
  storage.setItem(REVIEW_KEY, raw); return raw;
}
