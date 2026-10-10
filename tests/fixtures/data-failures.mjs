// Test-runner-only inputs. Not imported by src, not persisted as supplier records.
import { requestOnce } from "../../scripts/data-probe.mjs";

const envelope = () => ({ code: 0, message: "构造故障测试输入，不是真实供应商响应", request_id: "mock-only-request", data: {
  timestamp: 1788220800000,
  item: [{ thscode: "600519.SH", date_ms: 1788192000000, open_price: 10, high_price: 12, low_price: 9, close_price: 11, volume: 100, turnover: 1000 }],
} });

export const failures = [
  { id: "network", label: "网络失败", expected: "DATA_SOURCE_NETWORK_ERROR", http: null, business: null },
  { id: "timeout", label: "超时", expected: "DATA_SOURCE_TIMEOUT", http: null, business: null },
  { id: "auth", label: "鉴权失败", expected: "DATA_SOURCE_AUTH_FAILED", http: 401, business: 2001 },
  { id: "permission", label: "权限不足", expected: "DATA_SOURCE_PERMISSION_DENIED", http: 403, business: 2003 },
  { id: "rate", label: "429限流", expected: "DATA_SOURCE_RATE_LIMITED", http: 429, business: 4001 },
  { id: "empty", label: "空数据", expected: "EMPTY_RESULT", http: 200, business: 0 },
  { id: "business", label: "HTTP200但业务失败", expected: "DATA_SOURCE_UPSTREAM_ERROR", http: 200, business: 5003 },
  { id: "missing", label: "必要字段缺失", expected: "DATA_SOURCE_SCHEMA_INVALID", http: 200, business: 0 },
  { id: "conflict", label: "同口径数据冲突", expected: "DATA_SOURCE_CONFLICT", http: 200, business: 0 },
];

export async function runFailureMock(id) {
  const scenario = failures.find((value) => value.id === id);
  if (!scenario) throw new Error("Unknown test fixture");
  let calls = 0;
  const config = { key: "mock-only-placeholder", url: new URL("https://invalid.test/mock-only") };
  const result = await requestOnce(config, async () => {
    calls++;
    if (id === "network") throw new TypeError("mock network failure");
    if (id === "timeout") throw new DOMException("mock timeout", "TimeoutError");
    const body = envelope();
    body.code = scenario.business;
    if (id === "empty") body.data.item = [];
    if (id === "missing") delete body.data.item[0].close_price;
    if (id === "conflict") body.data.item.push({ ...body.data.item[0], close_price: 10 });
    return new Response(JSON.stringify(body), { status: scenario.http });
  });
  return { ...result, calls };
}
