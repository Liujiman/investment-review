// Explicit product availability, based on the user's current instruction.
// This is not an authentication response or a live provider capability probe.
export const DATA_SOURCE_STATUS = {
  status: "unavailable",
  explanation: "真实数据权限尚未取得可用验证，页面未接入供应商。",
  attempted: "已尝试 A 股历史日线：600519.SH / 1d / none，2026-09-01 至 2026-09-25。",
  result: "2026-10-10 09:20、09:21（上海）两次记录均为网络失败，未取得 HTTP / 业务 code / 数据；不能据此判断权限不足。",
} as const;
