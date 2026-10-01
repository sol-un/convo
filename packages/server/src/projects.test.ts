import { symlinkSync } from "node:fs"
import { join } from "node:path"
import {
  FolderUnavailable,
  InsideRepository,
  NotInRepository,
  ProjectId,
  ProjectNotFound,
} from "@convo/api"
import { NodeServices } from "@effect/platform-node"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { Database } from "./database.ts"
import { Projects } from "./projects.ts"
import { git, initRepo, mkdir, tempDir, writeFile } from "./test-support.ts"

const ProjectsLive = (filename: string) =>
  Projects.layer.pipe(
    Layer.provide(Database.layer({ filename })),
    Layer.provide(NodeServices.layer),
  )

const withProjects = Effect.provide(ProjectsLive(":memory:"))

describe("Projects.open", () => {
  it.effect("registers a git repo root as a Project named after it", () =>
    Effect.gen(function* () {
      const repo = initRepo(join(yield* tempDir, "billing"))

      const project = yield* Projects.use((projects) => projects.open(repo))
      const listed = yield* Projects.use((projects) => projects.list)

      assert.strictEqual(project.name, "billing")
      assert.strictEqual(project.path, repo)
      assert.strictEqual(project.mainBranch, "main")
      assert.deepStrictEqual(listed, [project])
    }).pipe(withProjects, Effect.scoped),
  )

  it.effect("offers the repo root for a folder inside a repo", () =>
    Effect.gen(function* () {
      const repo = initRepo(join(yield* tempDir, "billing"))
      const nested = mkdir(repo, "src", "api")

      const error = yield* Projects.use((projects) =>
        projects.open(nested),
      ).pipe(Effect.flip)

      assert.deepStrictEqual(
        error,
        new InsideRepository({ path: nested, root: repo }),
      )
      assert.deepStrictEqual(
        yield* Projects.use((projects) => projects.list),
        [],
      )
    }).pipe(withProjects, Effect.scoped),
  )

  it.effect("refuses a folder outside any repo", () =>
    Effect.gen(function* () {
      const plain = mkdir(yield* tempDir, "plain")

      const error = yield* Projects.use((projects) =>
        projects.open(plain),
      ).pipe(Effect.flip)

      assert.deepStrictEqual(error, new NotInRepository({ path: plain }))
    }).pipe(withProjects, Effect.scoped),
  )

  it.effect("refuses a relative or missing path", () =>
    Effect.gen(function* () {
      const missing = join(yield* tempDir, "missing")
      const open = (path: string) =>
        Projects.use((projects) => projects.open(path)).pipe(Effect.flip)

      assert.strictEqual((yield* open("billing"))._tag, "FolderUnavailable")
      assert.strictEqual((yield* open(missing))._tag, "FolderUnavailable")

      const file = join(yield* tempDir, "notes.txt")
      writeFile(file)
      assert.deepStrictEqual(
        yield* open(file),
        new FolderUnavailable({ path: file, message: "Not a folder" }),
      )
    }).pipe(withProjects, Effect.scoped),
  )

  it.effect("selects the existing Project when its path is opened again", () =>
    Effect.gen(function* () {
      const dir = yield* tempDir
      const repo = initRepo(join(dir, "billing"))
      const link = join(dir, "billing-link")
      symlinkSync(repo, link)

      const first = yield* Projects.use((projects) => projects.open(repo))
      const again = yield* Projects.use((projects) => projects.open(repo))
      const viaLink = yield* Projects.use((projects) => projects.open(link))

      assert.deepStrictEqual(again, first)
      assert.deepStrictEqual(viaLink, first)
      assert.deepStrictEqual(yield* Projects.use((projects) => projects.list), [
        first,
      ])
    }).pipe(withProjects, Effect.scoped),
  )
})

describe("main branch detection", () => {
  const mainBranchOf = (repo: string) =>
    Projects.use((projects) => projects.open(repo)).pipe(
      Effect.map((project) => project.mainBranch),
      withProjects,
    )

  it.effect("follows origin/HEAD", () =>
    Effect.gen(function* () {
      const dir = yield* tempDir
      const origin = initRepo(join(dir, "origin"), "trunk")
      git(dir, "clone", "--quiet", origin, "clone")
      git(join(dir, "clone"), "branch", "--quiet", "main")

      assert.strictEqual(yield* mainBranchOf(join(dir, "clone")), "trunk")
    }).pipe(Effect.scoped),
  )

  it.effect("prefers main, then master, without origin/HEAD", () =>
    Effect.gen(function* () {
      const dir = yield* tempDir
      const both = initRepo(join(dir, "both"), "master")
      git(both, "branch", "--quiet", "main")
      const master = initRepo(join(dir, "master"), "master")

      assert.strictEqual(yield* mainBranchOf(both), "main")
      assert.strictEqual(yield* mainBranchOf(master), "master")
    }).pipe(Effect.scoped),
  )

  it.effect("falls back to the checked-out branch", () =>
    Effect.gen(function* () {
      const repo = initRepo(join(yield* tempDir, "repo"), "develop")

      assert.strictEqual(yield* mainBranchOf(repo), "develop")
    }).pipe(Effect.scoped),
  )
})

describe("Projects.setMainBranch", () => {
  it.effect("stores an edited main branch", () =>
    Effect.gen(function* () {
      const repo = initRepo(join(yield* tempDir, "billing"))
      const project = yield* Projects.use((projects) => projects.open(repo))

      const edited = yield* Projects.use((projects) =>
        projects.setMainBranch(project.id, "release"),
      )

      assert.deepStrictEqual(edited, { ...project, mainBranch: "release" })
      assert.deepStrictEqual(yield* Projects.use((projects) => projects.list), [
        edited,
      ])
    }).pipe(withProjects, Effect.scoped),
  )

  it.effect("fails for an unknown Project", () =>
    Effect.gen(function* () {
      const error = yield* Projects.use((projects) =>
        projects.setMainBranch(ProjectId.make(404), "main"),
      ).pipe(Effect.flip)

      assert.deepStrictEqual(
        error,
        new ProjectNotFound({ id: ProjectId.make(404) }),
      )
    }).pipe(withProjects),
  )
})

describe("Project storage", () => {
  it.effect("keeps Projects in the database file across restarts", () =>
    Effect.gen(function* () {
      const dir = yield* tempDir
      const repo = initRepo(join(dir, "billing"))
      const filename = join(dir, "convo.db")
      const run = <A, E>(effect: Effect.Effect<A, E, Projects>) =>
        effect.pipe(Effect.provide(ProjectsLive(filename)))

      const project = yield* run(
        Projects.use((projects) => projects.open(repo)),
      )
      const listed = yield* run(Projects.use((projects) => projects.list))

      assert.deepStrictEqual(listed, [project])
    }).pipe(Effect.scoped),
  )
})
