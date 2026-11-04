import { defineConfig, devices } from "@playwright/test";

const existingBaseURL = process.env.PLAYWRIGHT_BASE_URL;
const baseURL = existingBaseURL ?? "http://127.0.0.1:3100";

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  ...(existingBaseURL ? {} : {
    webServer: {
      command: "npm run dev -- --hostname 127.0.0.1 --port 3100",
      url: "http://127.0.0.1:3100/overview",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  }),
});
