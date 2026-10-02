import process from "node:process";
import { defineConfig, devices } from "@playwright/test";

const real = process.env.E2E_REAL === "true";
export default defineConfig({
  testDir: "../../tests",
  testMatch: "**/frontend/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { outputFolder: "../../playwright-report", open: "never" }]],
  outputDir: "../../test-results",
  use: { channel: process.env.PLAYWRIGHT_CHANNEL || undefined, baseURL: "http://127.0.0.1:4173", trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "unit", testMatch: "**/unit/frontend/*.spec.ts" },
    { name: "integration", testMatch: "**/integration/frontend/*.spec.ts", use: { ...devices["Desktop Chrome"] } },
    ...(real ? [{ name: "functional", testMatch: "**/functional/frontend/*.spec.ts", use: { ...devices["Desktop Chrome"] } }] : []),
  ],
  webServer: [
    { command: "npm run dev -- --host 127.0.0.1 --port 4173", url: "http://127.0.0.1:4173", reuseExistingServer: !process.env.CI },
    ...(real ? [{ command: "python ../../tests/functional/frontend/server.py", url: "http://127.0.0.1:8000/health", reuseExistingServer: false, timeout: 30000 }] : []),
  ],
});
