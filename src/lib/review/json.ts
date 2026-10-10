import schema from "./contract-schema.json";
import { dateSchema, datetimeSchema } from "../domain/schema";

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type ObjectValue = { [key: string]: Json };
export const LIMIT = 524_288;
export function fail(path: string, message: string): never { throw new Error(`${path || "/"}：${message}`); }
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, v]) => `${JSON.stringify(key)}:${canonical(v)}`).join(",")}}`;
  return JSON.stringify(value);
}
export async function digest(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonical(value));
  const buffer = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(buffer)].map((n) => n.toString(16).padStart(2, "0")).join("");
}
export function checkSize(raw: string, limit = LIMIT) { if (new TextEncoder().encode(raw).byteLength > limit) fail("/", `超过${limit / 1024}KiB上限，不截断`); }

// Parse one object, while checking duplicate keys before JSON.parse can discard them.
export function parseStrict(raw: string, limit = LIMIT): ObjectValue {
  checkSize(raw, limit);
  let value: Json;
  try { value = JSON.parse(raw) as Json; } catch { fail("/", "非法JSON：只接受一个纯JSON对象，不提取围栏或说明中的片段"); }
  if (!value || Array.isArray(value) || typeof value !== "object") fail("/", "必须为单个JSON对象");
  let at = 0;
  const whitespace = () => { while (/\s/.test(raw[at] ?? "") && at < raw.length) at++; };
  const string = () => { const start = at++; while (at < raw.length) { if (raw[at] === "\\") at += 2; else if (raw[at++] === '"') break; } return JSON.parse(raw.slice(start, at)) as string; };
  const scan = (path: string, depth = 0) => {
    if (depth > 64) fail(path, "JSON嵌套过深，不执行递归消耗");
    whitespace();
    if (raw[at] === "{") {
      at++; whitespace(); const keys = new Set<string>();
      while (raw[at] !== "}") {
        const key = string(); const next = `${path}/${key}`;
        if (keys.has(key)) fail(next, "重复对象键"); keys.add(key);
        whitespace(); at++; scan(next, depth + 1); whitespace(); if (raw[at] !== ",") break; at++; whitespace();
      } at++;
    } else if (raw[at] === "[") {
      at++; whitespace(); let index = 0;
      while (raw[at] !== "]") { scan(`${path}/${index++}`, depth + 1); whitespace(); if (raw[at] !== ",") break; at++; } at++;
    } else if (raw[at] === '"') string();
    else { while (at < raw.length && !/[\s,}\]]/.test(raw[at])) at++; }
  };
  scan("");
  const finite = (v: Json, path: string) => {
    if (typeof v === "number" && !Number.isFinite(v)) fail(path, "非有限数值");
    if (Array.isArray(v)) v.forEach((x, i) => finite(x, `${path}/${i}`));
    else if (v && typeof v === "object") Object.entries(v).forEach(([k, x]) => finite(x, `${path}/${k}`));
  };
  finite(value, ""); return value;
}

type Rule = { [key: string]: unknown };
const definitions = schema.$defs as unknown as Record<string, Rule>;
const same = (a: unknown, b: unknown) => canonical(a) === canonical(b);
function validate(rule: Rule, value: unknown, path: string): void {
  if (typeof rule.$ref === "string") {
    const ref = definitions[rule.$ref.replace("#/$defs/", "")];
    if (!ref) fail(path, "schema引用不存在"); validate(ref, value, path);
  }
  const branches = (name: string) => rule[name] as Rule[] | undefined;
  for (const child of branches("allOf") ?? []) validate(child, value, path);
  for (const kind of ["anyOf", "oneOf"] as const) {
    const alternatives = branches(kind);
    if (alternatives) {
      const passed = alternatives.filter((child) => { try { validate(child, value, path); return true; } catch { return false; } }).length;
      if (!passed || (kind === "oneOf" && passed !== 1)) fail(path, "字段类型、枚举或对象结构不符合契约");
    }
  }
  if (rule.not) { let matches = false; try { validate(rule.not as Rule, value, path); matches = true; } catch {} if (matches) fail(path, "不允许的值"); }
  if (rule.if) { let matches = false; try { validate(rule.if as Rule, value, path); matches = true; } catch {} if (matches && rule.then) validate(rule.then as Rule, value, path); }
  if ("const" in rule && !same(rule.const, value)) fail(path, "固定字段值不匹配");
  if (Array.isArray(rule.enum) && !rule.enum.some((v) => same(v, value))) fail(path, "枚举值不合法");
  const object = value !== null && typeof value === "object" && !Array.isArray(value);
  if (rule.type && !(rule.type === "object" ? object : rule.type === "array" ? Array.isArray(value) : rule.type === "null" ? value === null : rule.type === "integer" ? typeof value === "number" && Number.isSafeInteger(value) : typeof value === rule.type)) fail(path, `必须为${rule.type}`);
  if (typeof value === "string") {
    const length = [...value].length;
    if (typeof rule.minLength === "number" && length < rule.minLength || typeof rule.maxLength === "number" && length > rule.maxLength) fail(path, "文本长度超限或为空");
    if (typeof rule.pattern === "string" && !new RegExp(rule.pattern).test(value)) fail(path, "字段格式不合法");
    if (rule.format === "date" && !dateSchema.safeParse(value).success || rule.format === "date-time" && !datetimeSchema.safeParse(value).success) fail(path, "无效日期/时间");
    if (rule.format === "uri") { try { const u = new URL(value); if (!["https:", "http:"].includes(u.protocol)) throw new Error(); } catch { fail(path, "无效原文URL"); } }
  }
  if (typeof value === "number" && (typeof rule.minimum === "number" && value < rule.minimum || typeof rule.maximum === "number" && value > rule.maximum)) fail(path, "数值超限");
  if (Array.isArray(value)) {
    if (typeof rule.minItems === "number" && value.length < rule.minItems || typeof rule.maxItems === "number" && value.length > rule.maxItems) fail(path, "数组条数不符合契约");
    if (rule.items) value.forEach((v, i) => validate(rule.items as Rule, v, `${path}/${i}`));
  }
  if (object) {
    const data = value as Record<string, unknown>, properties = (rule.properties ?? {}) as Record<string, Rule>;
    for (const key of (rule.required ?? []) as string[]) if (!Object.hasOwn(data, key)) fail(`${path}/${key}`, "缺少必填字段");
    if (typeof rule.minProperties === "number" && Object.keys(data).length < rule.minProperties) fail(path, "对象条目不足");
    for (const [key, v] of Object.entries(data)) {
      if (rule.propertyNames) validate(rule.propertyNames as Rule, key, `${path}/${key}`);
      if (Object.hasOwn(properties, key)) validate(properties[key], v, `${path}/${key}`);
      else if (rule.additionalProperties === false) fail(`${path}/${key}`, "未知字段，禁止覆盖程序事实或补入全量数据");
      else if (typeof rule.additionalProperties === "object") validate(rule.additionalProperties as Rule, v, `${path}/${key}`);
    }
  }
}
export function validateContract(root: "A_input" | "B_input" | "A_output" | "B_output", value: unknown) {
  checkSize(JSON.stringify(value)); validate(definitions[root], value, "");
}
export function outputSchema(stage: "prior_assessment" | "outcome_review") {
  const root = stage === "prior_assessment" ? "A_output" : "B_output";
  const reachable: Record<string, Rule> = {};
  const visit = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) { node.forEach(visit); return; }
    const rule = node as Rule;
    if (typeof rule.$ref === "string") {
      const key = rule.$ref.replace("#/$defs/", "");
      if (!Object.hasOwn(reachable, key)) { reachable[key] = definitions[key]; visit(definitions[key]); }
    }
    Object.values(rule).forEach(visit);
  };
  visit({ $ref: `#/$defs/${root}` });
  return { $schema: schema.$schema, $ref: `#/$defs/${root}`, $defs: reachable };
}
export function pointer(values: unknown, path: string): Json {
  if (!/^\/(?:[^~]|~[01])*$/.test(path)) fail(path, "无效JSON Pointer");
  let target: unknown = values;
  for (const token of path.slice(1).split("/").map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~"))) {
    if (["__proto__", "prototype", "constructor"].includes(token)) fail(path, "不安全字段路径");
    if (!target || typeof target !== "object" || !Object.hasOwn(target, token) || Array.isArray(target) && !/^(?:0|[1-9]\d*)$/.test(token)) fail(path, "引用字段不存在或数组越界");
    target = (target as Record<string, unknown>)[token];
  }
  if (target === null || target === undefined || typeof target === "string" && !target.trim() || typeof target === "object") fail(path, "引用目标未知、为空或为容器；只能引用已知标量字段");
  return target as Json;
}
