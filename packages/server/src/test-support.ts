import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Effect } from "effect"

// Temp folders live under the OS temp dir, outside any git repository, so a
// folder there is "outside any repo" for real.
export const tempDir = Effect.acquireRelease(
  Effect.sync(() => mkdtempSync(join(tmpdir(), "convo-test-"))),
  (dir) => Effect.sync(() => rmSync(dir, { recursive: true, force: true })),
)

export const mkdir = (...segments: Array<string>) => {
  const dir = join(...segments)
  mkdirSync(dir, { recursive: true })
  return dir
}

export const writeFile = (path: string, content = "") =>
  writeFileSync(path, content)

// No global git identity can be assumed (CI has none).
export const git = (cwd: string, ...args: Array<string>) =>
  execFileSync(
    "git",
    ["-c", "user.name=convo", "-c", "user.email=convo@example.com", ...args],
    { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  ).trim()

// A repository with one commit on `branch`, so the branch is not unborn.
export const initRepo = (dir: string, branch = "main") => {
  mkdirSync(dir, { recursive: true })
  git(dir, "init", "--quiet", "-b", branch)
  git(dir, "commit", "--quiet", "--allow-empty", "-m", "initial")
  return dir
}
