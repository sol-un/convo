import { Context, Effect, Layer, Option, Stream } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/process"

// The few git queries convo needs, run with the git CLI.
export class Git extends Context.Service<
  Git,
  {
    // The root of the working tree containing `dir`, if any.
    toplevel(dir: string): Effect.Effect<Option.Option<string>>
    // `origin/HEAD`, else `main`, else `master`, else the checked-out branch.
    detectMainBranch(root: string): Effect.Effect<string>
  }
>()("convo/Git") {
  static readonly layer = Layer.effect(
    Git,
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner

      // stdout of a successful run, trimmed; none if git exits non-zero.
      const run = (cwd: string, ...args: Array<string>) =>
        Effect.gen(function* () {
          const handle = yield* spawner.spawn(
            ChildProcess.make("git", args, {
              cwd,
              stdin: "ignore",
              stderr: "ignore",
            }),
          )
          const [stdout, exitCode] = yield* Effect.all(
            [
              handle.stdout.pipe(Stream.decodeText(), Stream.mkString),
              handle.exitCode,
            ],
            { concurrency: 2 },
          )
          return exitCode === 0 ? Option.some(stdout.trim()) : Option.none()
        }).pipe(Effect.scoped, Effect.orDie)

      const hasLocalBranch = (root: string, branch: string) =>
        run(
          root,
          "show-ref",
          "--verify",
          "--quiet",
          `refs/heads/${branch}`,
        ).pipe(Effect.map(Option.isSome))

      const toplevel = (dir: string) =>
        run(dir, "rev-parse", "--show-toplevel").pipe(
          Effect.map(Option.filter((root) => root.length > 0)),
        )

      const detectMainBranch = Effect.fn("Git.detectMainBranch")(function* (
        root: string,
      ) {
        const originHead = yield* run(
          root,
          "symbolic-ref",
          "--quiet",
          "--short",
          "refs/remotes/origin/HEAD",
        )
        if (Option.isSome(originHead)) {
          return originHead.value.replace(/^origin\//, "")
        }
        for (const branch of ["main", "master"]) {
          if (yield* hasLocalBranch(root, branch)) return branch
        }
        const current = yield* run(
          root,
          "symbolic-ref",
          "--quiet",
          "--short",
          "HEAD",
        )
        return Option.getOrElse(current, () => "main")
      })

      return Git.of({ toplevel, detectMainBranch })
    }),
  )
}
