import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"
import { ConvoApi } from "@convo/api"
import { NodeHttpServer, NodeServices } from "@effect/platform-node"
import { assert, layer } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { HttpClient, HttpClientRequest, HttpRouter } from "effect/http"
import { HttpApiClient } from "effect/http-api"
import { AppLayer } from "./app.ts"
import { Database } from "./database.ts"
import { FolderBrowser } from "./folders.ts"
import { Projects } from "./projects.ts"

const staticDir = fileURLToPath(new URL("./fixtures/public", import.meta.url))

const TestServices = Layer.mergeAll(
  Projects.layer,
  FolderBrowser.layer({ home: tmpdir() }),
).pipe(
  Layer.provide(Database.layer({ filename: ":memory:" })),
  Layer.provide(NodeServices.layer),
)

const TestServer = HttpRouter.serve(AppLayer({ staticDir }), {
  disableLogger: true,
}).pipe(
  Layer.provide(TestServices),
  Layer.provideMerge(NodeHttpServer.layerTest),
)

const getHtml = (path: string) =>
  HttpClient.execute(
    HttpClientRequest.get(path).pipe(HttpClientRequest.accept("text/html")),
  )

layer(TestServer)("server", (it) => {
  it.effect("answers the health check", () =>
    Effect.gen(function* () {
      const client = yield* HttpApiClient.make(ConvoApi)
      const health = yield* client.health.check()
      assert.deepStrictEqual(health, { status: "ok" })
    }),
  )

  it.effect("serves the Client's index.html for unknown Client routes", () =>
    Effect.gen(function* () {
      const response = yield* getHtml("/tasks/42")
      assert.strictEqual(response.status, 200)
      assert.include(yield* response.text, "convo test")
    }),
  )

  it.effect("does not fall back to index.html for unknown API routes", () =>
    Effect.gen(function* () {
      const response = yield* getHtml("/api/nope")
      assert.strictEqual(response.status, 404)
      assert.notInclude(yield* response.text, "convo test")
    }),
  )
})
