import { defineConfig, devices } from "@playwright/test"

// No `webServer`: each worker starts its own server (see e2e/fixtures.ts),
// so every worker gets its own data dir and $HOME.
export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/global-setup.ts",
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
})
