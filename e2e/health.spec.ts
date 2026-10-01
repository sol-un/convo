import { expect, test } from "./fixtures.ts"

test("the Client shows the server's health", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByTestId("health-status")).toHaveText("Server: ok")
})

test("a deep link loads the Client", async ({ page }) => {
  await page.goto("/tasks/42")
  await expect(page.getByTestId("health-status")).toHaveText("Server: ok")
})
