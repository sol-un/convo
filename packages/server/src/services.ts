import { homedir } from "node:os"
import { join } from "node:path"
import { NodeServices } from "@effect/platform-node"
import { Config, Effect, FileSystem, Layer } from "effect"
import { Database } from "./database.ts"
import { FolderBrowser } from "./folders.ts"
import { Projects } from "./projects.ts"

// `$XDG_DATA_HOME/convo`, overridden by `CONVO_DATA_DIR`.
export const DataDir = Config.String("CONVO_DATA_DIR").pipe(
  Config.orElse(() =>
    Config.String("XDG_DATA_HOME").pipe(
      Config.withDefault(join(homedir(), ".local", "share")),
      Config.map((dataHome) => join(dataHome, "convo")),
    ),
  ),
)

// The domain services the API needs, backed by `convo.db` in the data dir,
// which is created and migrated on startup.
export const ServicesLayer = Layer.unwrap(
  Effect.gen(function* () {
    const dataDir = yield* DataDir
    const fs = yield* FileSystem.FileSystem
    yield* fs.makeDirectory(dataDir, { recursive: true })
    return Layer.mergeAll(
      Projects.layer,
      FolderBrowser.layer({ home: homedir() }),
    ).pipe(
      Layer.provide(Database.layer({ filename: join(dataDir, "convo.db") })),
    )
  }),
).pipe(Layer.provideMerge(NodeServices.layer))
