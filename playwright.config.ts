import { defineConfig, devices } from "@playwright/test";

const apiServer = { command: "npm run api", url: "http://127.0.0.1:8787/api/auth/session", reuseExistingServer: true, env: { DATABASE_URL: process.env.DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:55432/brick_builder", SESSION_SECRET: process.env.SESSION_SECRET ?? "brick-builder-playwright-session-secret-32", APP_ORIGIN: process.env.APP_ORIGIN ?? "http://127.0.0.1:5173", THUMBNAIL_STORAGE_DRIVER: "local", PORT: "8787" } };
const webServer = { command: "npm run dev -- --host 127.0.0.1", url: "http://127.0.0.1:5173", reuseExistingServer: true };

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  use: { baseURL: "http://127.0.0.1:5173", trace: "retain-on-failure" },
  webServer: process.env.BROWSER_BENCHMARK_ONLY === "true" ? [webServer] : [apiServer, webServer],
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }]
});
