import { ConvoApi, Health } from "@convo/api"
import { Effect, Layer } from "effect"
import { HttpRouter, HttpServerResponse, HttpStaticServer } from "effect/http"
import { HttpApiBuilder } from "effect/http-api"

const HealthLive = HttpApiBuilder.group(ConvoApi, "health", (handlers) =>
  handlers.handle("check", () => Effect.succeed(Health.make({ status: "ok" }))),
)

const ApiLive = HttpApiBuilder.layer(ConvoApi).pipe(Layer.provide(HealthLive))

// The SPA fallback would answer any unmatched extensionless path with
// index.html; unknown API paths must stay 404s instead.
const ApiNotFound = HttpRouter.add(
  "*",
  "/api/*",
  HttpServerResponse.empty({ status: 404 }),
)

export const AppLayer = (options: { readonly staticDir: string }) =>
  Layer.mergeAll(
    ApiLive,
    ApiNotFound,
    HttpStaticServer.layer({ root: options.staticDir, spa: true }),
  )
