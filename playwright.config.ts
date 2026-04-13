import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./apps/web/e2e",
  timeout: 60_000,
  use: {
    baseURL: process.env.APP_URL ?? "http://127.0.0.1:3000",
    headless: true
  }
});
