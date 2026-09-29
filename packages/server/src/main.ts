import { createServer } from "node:http"
import { fileURLToPath } from "node:url"
import { NodeHttpServer, NodeRuntime } from "@effect/platform-node"
import { Config, Effect, Layer } from "effect"
import { HttpRouter } from "effect/http"
import { AppLayer } from "./app.ts"

// The build puts the web Client next to the bundled server, in `public/`.
const defaultStaticDir = fileURLToPath(new URL("./public", import.meta.url))

const ServerConfig = Config.all({
  port: Config.Port("CONVO_PORT").pipe(Config.withDefault(4317)),
  staticDir: Config.String("CONVO_STATIC_DIR").pipe(
    Config.withDefault(defaultStaticDir),
  ),
})

const Main = Layer.unwrap(
  Effect.gen(function* () {
    const { port, staticDir } = yield* ServerConfig
    return HttpRouter.serve(AppLayer({ staticDir })).pipe(
      Layer.provide(
        NodeHttpServer.layer(createServer, { host: "127.0.0.1", port }),
      ),
    )
  }),
)

Layer.launch(Main).pipe(NodeRuntime.runMain)
