import { datasetSchema, type Dataset } from "../domain/schema";

// Separate stage format: never overwrite the future full SPEC root document.
export const STORAGE_KEY = "investment-review:fields-import:v1";
export function decodeDataset(raw: string): Dataset {
  if (new TextEncoder().encode(raw).byteLength > 4 * 1024 * 1024) throw new Error("本地数据超过4MB上限。");
  return datasetSchema.parse(JSON.parse(raw));
}
export function saveDataset(storage: Pick<Storage, "getItem" | "setItem">, dataset: Dataset, expected: string | null): string {
  const raw = JSON.stringify(datasetSchema.parse(dataset));
  if (new TextEncoder().encode(raw).byteLength > 4 * 1024 * 1024) throw new Error("本地数据超过4MB上限。");
  if (storage.getItem(STORAGE_KEY) !== expected) throw new Error("另一标签页已修改数据，请刷新后继续；本次没有覆盖原记录。");
  storage.setItem(STORAGE_KEY, raw);
  return raw;
}
