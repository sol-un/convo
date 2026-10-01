import { basename, join } from "node:path"
import type { Page } from "@playwright/test"
import { expect, test } from "./fixtures.ts"

// The worker's server is shared by its tests, so each test asserts only on
// the Projects it registers, never on the whole list.

const projectList = (page: Page) =>
  page.getByRole("navigation", { name: "Projects" })

const openFolderBrowser = async (page: Page) => {
  await page.getByRole("button", { name: "Open Folder…" }).click()
  const dialog = page.getByRole("dialog", { name: "Open Folder" })
  await expect(dialog).toBeVisible()
  return dialog
}

const goTo = async (page: Page, path: string) => {
  const dialog = page.getByRole("dialog", { name: "Open Folder" })
  await dialog.getByLabel("Path").fill(path)
  await dialog.getByLabel("Path").press("Enter")
  await expect(dialog.getByLabel("Path")).toHaveValue(path)
}

const expectSelected = async (page: Page, name: string, path: string) => {
  await expect(
    projectList(page).getByRole("button", { name, exact: true }),
  ).toHaveAttribute("aria-current", "true")
  const pane = page.getByRole("main")
  await expect(pane.getByRole("heading", { name })).toBeVisible()
  await expect(pane.getByText(path)).toBeVisible()
}

test("opening a git repo root registers it as a Project and selects it", async ({
  page,
  convo,
  folders,
}) => {
  const repo = folders.repo("ledger")
  folders.folder("notes")

  await page.goto("/")
  const dialog = await openFolderBrowser(page)

  // The browser starts at $HOME and is browsed by clicking into folders.
  await expect(dialog.getByLabel("Path")).toHaveValue(convo.home)
  await dialog.getByRole("button", { name: basename(folders.dir) }).click()
  await expect(dialog.getByLabel("Path")).toHaveValue(folders.dir)
  const folderList = dialog.getByRole("list", { name: "Folders" })
  await expect(
    folderList.getByRole("button", { name: "ledger git" }),
  ).toBeVisible()
  await expect(
    folderList.getByRole("button", { name: "notes", exact: true }),
  ).toBeVisible()

  await folderList.getByRole("button", { name: "ledger git" }).click()
  await expect(dialog.getByLabel("Path")).toHaveValue(repo)
  await dialog.getByRole("button", { name: "Open", exact: true }).click()

  await expect(dialog).toBeHidden()
  await expectSelected(page, "ledger", repo)
  await expect(page.getByLabel("Main branch")).toHaveValue("main")
})

test("dot-folders are shown only when hidden folders are toggled on", async ({
  page,
  folders,
}) => {
  folders.folder(".cache")
  folders.folder("visible")

  await page.goto("/")
  const dialog = await openFolderBrowser(page)
  await goTo(page, folders.dir)
  const folderList = dialog.getByRole("list", { name: "Folders" })
  await expect(
    folderList.getByRole("button", { name: "visible" }),
  ).toBeVisible()
  await expect(folderList.getByRole("button", { name: ".cache" })).toBeHidden()

  await dialog.getByLabel("Show hidden folders").check()
  await expect(folderList.getByRole("button", { name: ".cache" })).toBeVisible()
})

test("opening a folder inside a repo offers to open the repo root instead", async ({
  page,
  request,
  folders,
}) => {
  const repo = folders.repo("payments")
  const nested = folders.folder("payments", "src", "api")

  const response = await request.post("/api/projects", {
    data: { path: nested },
  })
  expect(response.status()).toBe(409)
  expect(await response.json()).toMatchObject({
    _tag: "InsideRepository",
    root: repo,
  })

  await page.goto("/")
  const dialog = await openFolderBrowser(page)
  await goTo(page, nested)
  await dialog.getByRole("button", { name: "Open", exact: true }).click()

  const offer = dialog.getByRole("alert")
  await expect(offer).toContainText(`inside the git repository at ${repo}`)
  await expect(
    projectList(page).getByRole("button", { name: "payments", exact: true }),
  ).toBeHidden()

  await offer.getByRole("button", { name: "Open repository root" }).click()
  await expect(dialog).toBeHidden()
  await expectSelected(page, "payments", repo)
})

test("opening a folder outside any repo is refused with an explanation", async ({
  page,
  request,
  folders,
}) => {
  const plain = folders.folder("scratch")

  const response = await request.post("/api/projects", {
    data: { path: plain },
  })
  expect(response.status()).toBe(422)
  expect(await response.json()).toMatchObject({ _tag: "NotInRepository" })

  await page.goto("/")
  const dialog = await openFolderBrowser(page)
  await goTo(page, plain)
  await dialog.getByRole("button", { name: "Open", exact: true }).click()

  await expect(dialog.getByRole("alert")).toContainText(
    `${plain} is not inside a git repository`,
  )
  await expect(dialog).toBeVisible()
  await expect(
    projectList(page).getByRole("button", { name: "scratch", exact: true }),
  ).toBeHidden()
})

test("opening an already registered path selects the existing Project", async ({
  page,
  request,
  folders,
}) => {
  const repo = folders.repo("inventory")
  const first = await request.post("/api/projects", { data: { path: repo } })
  expect(first.status()).toBe(200)
  const registered = await first.json()

  await page.goto("/")
  const sidebarEntry = projectList(page).getByRole("button", {
    name: "inventory",
    exact: true,
  })
  await expect(sidebarEntry).toHaveCount(1)
  await expect(sidebarEntry).not.toHaveAttribute("aria-current", "true")

  const dialog = await openFolderBrowser(page)
  await goTo(page, repo)
  await dialog.getByRole("button", { name: "Open", exact: true }).click()

  await expect(dialog).toBeHidden()
  await expectSelected(page, "inventory", repo)
  await expect(sidebarEntry).toHaveCount(1)

  const again = await request.post("/api/projects", { data: { path: repo } })
  expect(again.status()).toBe(200)
  expect(await again.json()).toEqual(registered)
})

test("Projects and their edited main branch survive a server restart", async ({
  page,
  request,
  convo,
  folders,
}) => {
  const repo = folders.repo("archive", { branch: "master" })
  await request.post("/api/projects", { data: { path: repo } })

  await page.goto("/")
  await projectList(page)
    .getByRole("button", { name: "archive", exact: true })
    .click()
  const mainBranch = page.getByLabel("Main branch")
  await expect(mainBranch).toHaveValue("master")
  await mainBranch.fill("release")
  await page.getByRole("button", { name: "Save" }).click()
  await expect(page.getByRole("status")).toHaveText("Saved")

  await convo.restart()
  await page.goto(convo.url)

  await projectList(page)
    .getByRole("button", { name: "archive", exact: true })
    .click()
  await expect(page.getByRole("main").getByText(repo)).toBeVisible()
  await expect(page.getByLabel("Main branch")).toHaveValue("release")
})

test("the path bar accepts ~ for the home folder", async ({
  page,
  convo,
  folders,
}) => {
  const name = basename(folders.dir)

  await page.goto("/")
  await openFolderBrowser(page)
  const pathBar = page.getByLabel("Path")
  await pathBar.fill(`~/${name}`)
  await pathBar.press("Enter")

  await expect(pathBar).toHaveValue(join(convo.home, name))
})
