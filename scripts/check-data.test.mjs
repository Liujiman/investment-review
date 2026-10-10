import assert from "node:assert/strict";
import test from "node:test";
import { configuration, inspectResponse, query, redact, requestOnce, shanghaiDate, updateNotes } from "./check-data.mjs";

// Synthetic unit-test inputs only. Never persisted as real provider responses.
const envelope = () => ({ code: 0, message: "synthetic test", request_id: "test-only-id", data: {
  timestamp: 1788220800000,
  item: [{ date_ms: 1788192000000, open_price: 10, high_price: 12, low_price: 9, close_price: 11, volume: 100, turnover: 1000 }],
} });
const inspect = (body, status = 200) => inspectResponse(status, JSON.stringify(body));

test("explicit dotenv parsing handles BOM and quotes; URL has exact short interval and no key", () => {
  const config = configuration('\uFEFFFUYAO_BASE_URL=https://fuyao.aicubes.cn\nFUYAO_API_KEY="test-only-secret"\nOTHER_KEY=preserved');
  assert.equal(config.key, "test-only-secret");
  assert.equal(config.url.origin, "https://fuyao.aicubes.cn");
  assert.deepEqual(Object.fromEntries(config.url.searchParams), query);
  assert.equal(config.url.href.includes(config.key), false);
  assert.equal(new Date(Number(query.start)).toISOString(), "2026-08-31T16:00:00.000Z");
  assert.equal(new Date(Number(query.end)).toISOString(), "2026-09-25T15:59:59.999Z");
});

test("missing key and arbitrary upstream URL are rejected before fetch", () => {
  assert.throws(() => configuration("FUYAO_API_KEY="), /NOT_CONFIGURED/);
  for (const base of ["https://example.com", "https://fuyao.aicubes.cn@evil.test", "http://fuyao.aicubes.cn", "https://fuyao.aicubes.cn/?key=x"]) {
    assert.throws(() => configuration(`FUYAO_API_KEY=test-only-secret\nFUYAO_BASE_URL=${base}`), /BASE_URL_INVALID/);
  }
});

test("HTTP and business failures never become successful data", () => {
  assert.equal(inspect({ ...envelope(), code: 2001 }).result, "DATA_SOURCE_AUTH_FAILED");
  assert.equal(inspect({ ...envelope(), code: 2003 }).result, "DATA_SOURCE_PERMISSION_DENIED");
  assert.equal(inspect({ ...envelope(), code: 5003 }).result, "DATA_SOURCE_UPSTREAM_ERROR");
  assert.equal(inspect(envelope(), 503).result, "DATA_SOURCE_HTTP_ERROR");
  assert.equal(inspectResponse(429, "not JSON").result, "DATA_SOURCE_RATE_LIMITED");
  assert.equal(inspectResponse(200, "<html>error</html>").result, "DATA_SOURCE_SCHEMA_INVALID");
});

test("success preserves count, request ID, date range and upstream timestamp; empty is explicit", () => {
  const result = inspect(envelope());
  assert.equal(result.result, "SUCCESS");
  assert.equal(result.request_id, "test-only-id");
  assert.equal(result.item_count, 1);
  assert.equal(result.coverage_start_date, "2026-09-01");
  assert.equal(result.coverage_end_date, "2026-09-01");
  assert.equal(result.provider_data_timestamp, 1788220800000);
  const empty = envelope(); empty.data.item = [];
  assert.equal(inspect(empty).result, "EMPTY_RESULT");
  assert.equal(inspect(empty).coverage_start_date, null);
});

test("schema, OHLC, nulls, negative volume, duplicate and out-of-window dates reject", () => {
  for (const mutation of [
    (body) => { body.data.item[0].high_price = 5; },
    (body) => { body.data.item[0].volume = -1; },
    (body) => { body.data.item[0].close_price = "11"; },
    (body) => { body.data.item[0].date_ms = Number(query.end) + 1; },
    (body) => { body.data.item.push(body.data.item[0]); },
    (body) => { body.data.item[0] = null; },
    (body) => { body.data.timestamp = null; },
    (body) => { body.data.item = null; },
  ]) { const body = envelope(); mutation(body); assert.equal(inspect(body).result, "DATA_SOURCE_SCHEMA_INVALID"); }
  assert.equal(shanghaiDate(Number(query.start)), "2026-09-01");
});

test("echoed credential is redacted including JSON and URL encodings", () => {
  const secret = 'test+only"secret';
  const text = [secret, encodeURIComponent(secret), JSON.stringify(secret).slice(1, -1)].join(" / ");
  const safe = redact(text, secret);
  assert.equal(safe, "[REDACTED] / [REDACTED] / [REDACTED]");
});

test("single request sets authentication, timeout and rejects redirects; echoed key never reaches records", async () => {
  const config = configuration("FUYAO_API_KEY=test-only-secret");
  let calls = 0;
  const result = await requestOnce(config, async (url, options) => {
    calls++;
    assert.equal(url.href.includes(config.key), false);
    assert.equal(options.headers["X-api-key"], config.key);
    assert.equal(options.redirect, "error");
    assert.ok(options.signal instanceof AbortSignal);
    return new Response(JSON.stringify({ code: 2001, message: config.key, request_id: "test-only" }), { status: 200 });
  });
  assert.equal(calls, 1);
  assert.equal(result.check.result, "DATA_SOURCE_AUTH_FAILED");
  assert.equal(JSON.stringify(result).includes(config.key), false);
});

test("network failure and timeout make exactly one attempt and never synthesize response data", async () => {
  const config = configuration("FUYAO_API_KEY=test-only-secret");
  for (const error of [new Error(config.key), new DOMException(config.key, "TimeoutError")]) {
    let calls = 0;
    const result = await requestOnce(config, async () => { calls++; throw error; });
    assert.equal(calls, 1);
    assert.equal(result.responseText, null);
    assert.equal(result.check.item_count, null);
    assert.equal(result.check.result, error.name === "TimeoutError" ? "DATA_SOURCE_TIMEOUT" : "DATA_SOURCE_NETWORK_ERROR");
    assert.equal(JSON.stringify(result).includes(config.key), false);
  }
});

test("only section 11 changes; failure stays failure and external table text is escaped", () => {
  const notes = "# unchanged\n## 11. old\nold table\n## 12. next\nremain unchanged\n";
  const summary = { ...inspect({ code: 2003, message: "denied|<script>\n", request_id: "test-only" }),
    started_at_shanghai: "2026-10-10T12:00:00+08:00", node_version: "test", summary_file: "test-only.summary.json", response_file: "test-only.response.txt" };
  const updated = updateNotes(notes, summary);
  assert.ok(updated.startsWith("# unchanged\n"));
  assert.ok(updated.endsWith("## 12. next\nremain unchanged\n"));
  assert.ok(updated.includes("失败：DATA_SOURCE_PERMISSION_DENIED"));
  assert.ok(updated.includes("denied&#124;&lt;script&gt;"));
  assert.throws(() => updateNotes("no sections", summary), /SECTION_NOT_FOUND/);
});
