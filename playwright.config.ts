import { defineConfig, devices } from "@playwright/test"

const port = 4318
const baseURL = `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: "e2e",
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // exec, so the shutdown signal reaches node; pnpm does not forward it.
    command: "pnpm build && exec node packages/server/dist/main.js",
    // Playwright probes readiness with HEAD, which the GET-only API routes
    // do not answer, so it probes the Client instead.
    url: `${baseURL}/`,
    env: { CONVO_PORT: String(port) },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
