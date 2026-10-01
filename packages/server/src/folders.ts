import type { FolderEntry } from "@convo/api"
import { FolderUnavailable } from "@convo/api"
import {
  Context,
  Effect,
  FileSystem,
  Layer,
  Option,
  Path,
  type PlatformError,
  Semaphore,
} from "effect"

// Why a folder cannot be used, in words for the human.
const describeFailure = (error: PlatformError.PlatformError) => {
  switch (error.reason._tag) {
    case "NotFound":
      return "No such folder"
    case "PermissionDenied":
      return "Permission denied"
    case "BadArgument":
      return "Not a folder"
    default:
      return error.reason.message
  }
}

export const FolderErrors = {
  fromPlatform: (path: string) => (error: PlatformError.PlatformError) =>
    new FolderUnavailable({ path, message: describeFailure(error) }),
  notAbsolute: (path: string) =>
    new FolderUnavailable({ path, message: "Not an absolute path" }),
  notAFolder: (path: string) =>
    new FolderUnavailable({ path, message: "Not a folder" }),
}

export class FolderBrowser extends Context.Service<
  FolderBrowser,
  {
    // The folder at `path` (the home folder if undefined) with its
    // subfolders, `depth` levels deep (1 if undefined).
    list(
      path: string | undefined,
      options: {
        readonly hidden: boolean
        readonly depth?: number | undefined
      },
    ): Effect.Effect<FolderEntry, FolderUnavailable>
  }
>()("convo/FolderBrowser") {
  static readonly layer = (options: { readonly home: string }) =>
    Layer.effect(
      FolderBrowser,
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        const path = yield* Path.Path

        const resolve = (requested: string) => {
          if (requested === "~" || requested.startsWith("~/")) {
            return Effect.succeed(
              path.resolve(options.home, `.${requested.slice(1)}`),
            )
          }
          if (!path.isAbsolute(requested)) {
            return Effect.fail(FolderErrors.notAbsolute(requested))
          }
          return Effect.succeed(path.resolve(requested))
        }

        // One walk's filesystem calls share `permits`, however deep it goes,
        // so nested levels cannot multiply the number of open files.
        const walker = (permits: Semaphore.Semaphore, hidden: boolean) => {
          const io = Semaphore.withPermit(permits)

          // Follows symlinks; anything unreadable or dangling is not a folder.
          const isDirectory = (dir: string) =>
            io(fs.stat(dir)).pipe(
              Effect.map((info) => info.type === "Directory"),
              Effect.orElseSucceed(() => false),
            )

          // A `.git` file (not only a directory) marks a worktree or
          // submodule.
          const isRepoRoot = (dir: string) =>
            io(fs.exists(path.join(dir, ".git"))).pipe(
              Effect.orElseSucceed(() => false),
            )

          const subfolders = (
            dir: string,
            depth: number,
          ): Effect.Effect<
            ReadonlyArray<FolderEntry>,
            PlatformError.PlatformError
          > =>
            Effect.gen(function* () {
              const names = yield* io(fs.readDirectory(dir))
              const visible = hidden
                ? names
                : names.filter((name) => !name.startsWith("."))
              const entries = yield* Effect.forEach(
                visible,
                (name) => subfolder(path.join(dir, name), name, depth - 1),
                { concurrency: "unbounded" },
              )
              return entries.flat().sort((a, b) => a.name.localeCompare(b.name))
            })

          // Below the requested depth, or where it cannot be read, a
          // subfolder is listed without its own entries.
          const subfolder = (dir: string, name: string, depth: number) =>
            Effect.gen(function* () {
              if (!(yield* isDirectory(dir))) return []
              const entry: FolderEntry = {
                name,
                path: dir,
                isRepoRoot: yield* isRepoRoot(dir),
              }
              if (depth === 0) return [entry]
              const entries = yield* Effect.option(subfolders(dir, depth))
              return [
                Option.isSome(entries)
                  ? { ...entry, entries: entries.value }
                  : entry,
              ]
            })

          return { isRepoRoot, subfolders }
        }

        const list = Effect.fn("FolderBrowser.list")(function* (
          requested: string | undefined,
          {
            hidden,
            depth = 1,
          }: { readonly hidden: boolean; readonly depth?: number | undefined },
        ) {
          const dir =
            requested === undefined ? options.home : yield* resolve(requested)
          const walk = walker(yield* Semaphore.make(16), hidden)
          const entries = yield* walk
            .subfolders(dir, depth)
            .pipe(Effect.mapError(FolderErrors.fromPlatform(dir)))
          const folder: FolderEntry = {
            name: path.basename(dir) || dir,
            path: dir,
            isRepoRoot: yield* walk.isRepoRoot(dir),
            entries,
          }
          const parent = path.dirname(dir)
          return parent === dir ? folder : { ...folder, parent }
        })

        return FolderBrowser.of({ list })
      }),
    )
}
