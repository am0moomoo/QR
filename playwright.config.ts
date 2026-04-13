import { defineConfig } from "@playwright/test";

export default defineConfig({
  outputDir: "test-results/playwright",
  reporter: [["list"], ["html", { open: "never" }]],
  retries: 0,
  testDir: "./apps/web/e2e",
  timeout: 60_000,
  use: {
    baseURL: process.env.APP_URL ?? "http://127.0.0.1:3000",
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure"
  }
});
