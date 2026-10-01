import {
  type FolderUnavailable,
  InsideRepository,
  NotInRepository,
  type Project,
  type ProjectId,
  ProjectNotFound,
} from "@convo/api"
import { Context, Effect, FileSystem, Layer, Option, Path } from "effect"
import { FolderErrors } from "./folders.ts"
import { Git } from "./git.ts"
import { ProjectRepository } from "./project-repository.ts"

export class Projects extends Context.Service<
  Projects,
  {
    readonly list: Effect.Effect<ReadonlyArray<Project>>
    // Registers the git repo rooted at `path` as a Project, or returns the
    // Project already registered there.
    open(
      path: string,
    ): Effect.Effect<
      Project,
      FolderUnavailable | InsideRepository | NotInRepository
    >
    setMainBranch(
      id: ProjectId,
      mainBranch: string,
    ): Effect.Effect<Project, ProjectNotFound>
  }
>()("convo/Projects") {
  // Requires the database and platform services; entrypoints and tests
  // decide how those are provided.
  static readonly layer = Layer.effect(
    Projects,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const pathService = yield* Path.Path
      const git = yield* Git
      const repository = yield* ProjectRepository

      // Symlinks resolved, so one repo is one Project however it is reached.
      const canonical = Effect.fn(function* (path: string) {
        if (!pathService.isAbsolute(path)) {
          return yield* FolderErrors.notAbsolute(path)
        }
        const resolved = yield* fs
          .realPath(path)
          .pipe(Effect.mapError(FolderErrors.fromPlatform(path)))
        const info = yield* fs
          .stat(resolved)
          .pipe(Effect.mapError(FolderErrors.fromPlatform(path)))
        if (info.type !== "Directory") {
          return yield* FolderErrors.notAFolder(path)
        }
        return resolved
      })

      const open = Effect.fn("Projects.open")(function* (requested: string) {
        const path = yield* canonical(requested)
        const toplevel = yield* git.toplevel(path)
        if (Option.isNone(toplevel)) {
          return yield* new NotInRepository({ path })
        }
        const root = yield* canonical(toplevel.value).pipe(Effect.orDie)
        if (root !== path) {
          return yield* new InsideRepository({ path, root })
        }
        return yield* repository.insertOrGet({
          name: pathService.basename(root),
          path: root,
          mainBranch: yield* git.detectMainBranch(root),
        })
      })

      const setMainBranch = (id: ProjectId, mainBranch: string) =>
        repository.updateMainBranch(id, mainBranch).pipe(
          Effect.flatMap(
            Option.match({
              onNone: () => Effect.fail(new ProjectNotFound({ id })),
              onSome: Effect.succeed,
            }),
          ),
        )

      return Projects.of({ list: repository.list, open, setMainBranch })
    }),
  ).pipe(Layer.provide([Git.layer, ProjectRepository.layer]))
}
