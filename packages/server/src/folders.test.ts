import { chmodSync, symlinkSync } from "node:fs"
import { join } from "node:path"
import type { FolderEntry } from "@convo/api"
import { NodeServices } from "@effect/platform-node"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { FolderBrowser } from "./folders.ts"
import { initRepo, mkdir, tempDir, writeFile } from "./test-support.ts"

const names = (folder: FolderEntry) =>
  (folder.entries ?? []).map((entry) => entry.name)

const withBrowser = (home: string) =>
  Effect.provide(
    FolderBrowser.layer({ home }).pipe(Layer.provide(NodeServices.layer)),
  )

describe("FolderBrowser.list", () => {
  it.effect("lists subdirectories by name, badging git repo roots", () =>
    Effect.gen(function* () {
      const root = yield* tempDir
      mkdir(root, "notes")
      initRepo(join(root, "app"))
      mkdir(root, "Zeta")
      writeFile(join(root, "readme.txt"))

      const listing = yield* FolderBrowser.use((browser) =>
        browser.list(root, { hidden: false }),
      ).pipe(withBrowser(root))

      assert.strictEqual(listing.path, root)
      assert.deepStrictEqual(listing.entries, [
        { name: "app", path: join(root, "app"), isRepoRoot: true },
        { name: "notes", path: join(root, "notes"), isRepoRoot: false },
        { name: "Zeta", path: join(root, "Zeta"), isRepoRoot: false },
      ])
    }).pipe(Effect.scoped),
  )

  it.effect("hides dot-directories unless asked for them", () =>
    Effect.gen(function* () {
      const root = yield* tempDir
      mkdir(root, ".config")
      mkdir(root, "code")
      const list = (hidden: boolean) =>
        FolderBrowser.use((browser) => browser.list(root, { hidden })).pipe(
          withBrowser(root),
        )

      assert.deepStrictEqual(names(yield* list(false)), ["code"])
      assert.deepStrictEqual(names(yield* list(true)), [".config", "code"])
    }).pipe(Effect.scoped),
  )

  it.effect("starts at the home folder, expands ~ and names the parent", () =>
    Effect.gen(function* () {
      const home = yield* tempDir
      const code = mkdir(home, "code")
      const list = (path: string | undefined) =>
        FolderBrowser.use((browser) =>
          browser.list(path, { hidden: false }),
        ).pipe(withBrowser(home))

      const start = yield* list(undefined)
      assert.strictEqual(start.path, home)
      assert.deepStrictEqual(names(start), ["code"])

      const tilde = yield* list("~/code/")
      assert.strictEqual(tilde.path, code)
      assert.strictEqual(tilde.parent, home)

      assert.strictEqual((yield* list(`${code}/..`)).path, home)
      assert.notProperty(yield* list("/"), "parent")
    }).pipe(Effect.scoped),
  )

  it.effect("refuses relative paths and missing folders", () =>
    Effect.gen(function* () {
      const home = yield* tempDir
      const fail = (path: string) =>
        FolderBrowser.use((browser) =>
          browser.list(path, { hidden: false }),
        ).pipe(withBrowser(home), Effect.flip)

      const relative = yield* fail("code")
      assert.strictEqual(relative._tag, "FolderUnavailable")
      assert.strictEqual(relative.message, "Not an absolute path")

      const missing = yield* fail(join(home, "nope"))
      assert.strictEqual(missing._tag, "FolderUnavailable")
      assert.strictEqual(missing.path, join(home, "nope"))
    }).pipe(Effect.scoped),
  )

  it.effect("follows symlinks to folders and skips dangling ones", () =>
    Effect.gen(function* () {
      const root = yield* tempDir
      const target = initRepo(join(root, "real"))
      symlinkSync(target, join(root, "linked"))
      symlinkSync(join(root, "gone"), join(root, "dangling"))

      const listing = yield* FolderBrowser.use((browser) =>
        browser.list(root, { hidden: false }),
      ).pipe(withBrowser(root))

      assert.deepStrictEqual(listing.entries, [
        { name: "linked", path: join(root, "linked"), isRepoRoot: true },
        { name: "real", path: target, isRepoRoot: true },
      ])
    }).pipe(Effect.scoped),
  )

  it.effect("describes the folder itself, which may be a repo root", () =>
    Effect.gen(function* () {
      const root = yield* tempDir
      const app = initRepo(join(root, "app"))
      mkdir(app, "src")
      const list = (path: string) =>
        FolderBrowser.use((browser) =>
          browser.list(path, { hidden: false }),
        ).pipe(withBrowser(root))

      assert.deepStrictEqual(yield* list(app), {
        name: "app",
        path: app,
        isRepoRoot: true,
        parent: root,
        entries: [{ name: "src", path: join(app, "src"), isRepoRoot: false }],
      })
      assert.strictEqual((yield* list("/")).name, "/")
      assert.isFalse((yield* list(root)).isRepoRoot)
    }).pipe(Effect.scoped),
  )

  it.effect("lists subfolders down to the depth asked for", () =>
    Effect.gen(function* () {
      const root = yield* tempDir
      mkdir(root, "a", "b", "c")
      mkdir(root, "a", ".hidden")
      const list = (depth: number) =>
        FolderBrowser.use((browser) =>
          browser.list(root, { hidden: false, depth }),
        ).pipe(withBrowser(root))
      const a = join(root, "a")
      const b = join(a, "b")

      assert.deepStrictEqual((yield* list(1)).entries, [
        { name: "a", path: a, isRepoRoot: false },
      ])
      assert.deepStrictEqual((yield* list(2)).entries, [
        {
          name: "a",
          path: a,
          isRepoRoot: false,
          entries: [{ name: "b", path: b, isRepoRoot: false }],
        },
      ])
    }).pipe(Effect.scoped),
  )

  it.effect("leaves out the entries of a subfolder it cannot read", () =>
    Effect.gen(function* () {
      const root = yield* tempDir
      const locked = mkdir(root, "locked")
      chmodSync(locked, 0o000)
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => chmodSync(locked, 0o700)),
      )

      const listing = yield* FolderBrowser.use((browser) =>
        browser.list(root, { hidden: false, depth: 2 }),
      ).pipe(withBrowser(root))

      assert.deepStrictEqual(listing.entries, [
        { name: "locked", path: locked, isRepoRoot: false },
      ])
    }).pipe(Effect.scoped),
  )
})
