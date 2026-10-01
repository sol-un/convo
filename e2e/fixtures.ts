import { type ChildProcess, execFileSync, spawn } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync } from "node:fs"
import { createServer } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test as base } from "@playwright/test"

// The server under test, built once by global-setup.ts. Each Playwright
// worker runs its own, with its own data dir and its own $HOME, a temp
// folder outside any git repository.
export interface ConvoServer {
  readonly url: string
  readonly home: string
  // Stops the server and starts it again on the same data dir.
  restart(): Promise<void>
}

// Folders for one test, inside the worker's $HOME.
export interface TestFolders {
  readonly dir: string
  folder(...segments: Array<string>): string
  // A git repo with one commit on `branch`.
  repo(name: string, options?: { readonly branch?: string }): string
}

const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const server = createServer()
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      server.close(() =>
        typeof address === "object" && address !== null
          ? resolve(address.port)
          : reject(new Error("no port")),
      )
    })
  })

const waitUntilHealthy = async (url: string, child: ChildProcess) => {
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error("server exited on startup")
    try {
      if ((await fetch(`${url}/api/health`)).ok) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error("server did not become healthy")
}

const startServer = async (env: Record<string, string>) => {
  const port = await freePort()
  const url = `http://127.0.0.1:${port}`
  const child = spawn("node", ["packages/server/dist/main.js"], {
    env: { ...process.env, ...env, CONVO_PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  })
  let output = ""
  child.stdout?.on("data", (chunk) => (output += chunk))
  child.stderr?.on("data", (chunk) => (output += chunk))
  try {
    await waitUntilHealthy(url, child)
  } catch (error) {
    child.kill()
    throw new Error(`${(error as Error).message}:\n${output}`)
  }
  const stop = () =>
    new Promise<void>((resolve) => {
      if (child.exitCode !== null) return resolve()
      child.once("exit", () => resolve())
      child.kill("SIGTERM")
    })
  return { url, stop }
}

// No global git identity can be assumed (CI has none).
export const git = (cwd: string, ...args: Array<string>) =>
  execFileSync(
    "git",
    ["-c", "user.name=convo", "-c", "user.email=convo@example.com", ...args],
    { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  ).trim()

export const test = base.extend<
  { folders: TestFolders },
  { convo: ConvoServer }
>({
  convo: [
    // biome-ignore lint/correctness/noEmptyPattern: Playwright needs the destructuring
    async ({}, use) => {
      const root = mkdtempSync(join(tmpdir(), "convo-e2e-"))
      const home = join(root, "home")
      const dataDir = join(root, "data")
      mkdirSync(home)
      const env = { HOME: home, CONVO_DATA_DIR: dataDir }
      let server = await startServer(env)
      await use({
        get url() {
          return server.url
        },
        home,
        restart: async () => {
          await server.stop()
          server = await startServer(env)
        },
      })
      await server.stop()
      rmSync(root, { recursive: true, force: true })
    },
    { scope: "worker" },
  ],

  baseURL: async ({ convo }, use) => {
    await use(convo.url)
  },

  folders: async ({ convo }, use) => {
    const dir = mkdtempSync(join(convo.home, "test-"))
    const folder = (...segments: Array<string>) => {
      const path = join(dir, ...segments)
      mkdirSync(path, { recursive: true })
      return path
    }
    await use({
      dir,
      folder,
      repo: (name, options) => {
        const path = folder(name)
        git(path, "init", "--quiet", "-b", options?.branch ?? "main")
        git(path, "commit", "--quiet", "--allow-empty", "-m", "initial")
        return path
      },
    })
  },
})

export { expect } from "@playwright/test"
