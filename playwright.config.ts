import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser", workers: 1, timeout: 30_000,
  use: { baseURL: "http://localhost:3000", channel: "chrome", trace: "retain-on-failure" },
  webServer: { command: "npm.cmd run dev -- --port 3000", url: "http://localhost:3000", reuseExistingServer: true, timeout: 60_000 },
});
