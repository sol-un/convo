import { ConvoApi, Health } from "@convo/api"
import { Effect, Layer } from "effect"
import { HttpRouter, HttpServerResponse, HttpStaticServer } from "effect/http"
import { HttpApiBuilder } from "effect/http-api"
import { FolderBrowser } from "./folders.ts"
import { Projects } from "./projects.ts"

const HealthLive = HttpApiBuilder.group(ConvoApi, "health", (handlers) =>
  handlers.handle("check", () => Effect.succeed(Health.make({ status: "ok" }))),
)

const FoldersLive = HttpApiBuilder.group(
  ConvoApi,
  "folders",
  Effect.fn(function* (handlers) {
    const browser = yield* FolderBrowser
    return handlers.handle("list", ({ query }) =>
      browser.list(query.path, {
        hidden: query.hidden ?? false,
        depth: query.depth,
      }),
    )
  }),
)

const ProjectsLive = HttpApiBuilder.group(
  ConvoApi,
  "projects",
  Effect.fn(function* (handlers) {
    const projects = yield* Projects
    return handlers.handleAll({
      list: () => projects.list,
      open: ({ payload }) => projects.open(payload.path),
      update: ({ params, payload }) =>
        projects.setMainBranch(params.id, payload.mainBranch),
    })
  }),
)

const ApiLive = HttpApiBuilder.layer(ConvoApi).pipe(
  Layer.provide([HealthLive, FoldersLive, ProjectsLive]),
)

// The SPA fallback would answer any unmatched extensionless path with
// index.html; unknown API paths must stay 404s instead.
const ApiNotFound = HttpRouter.add(
  "*",
  "/api/*",
  HttpServerResponse.empty({ status: 404 }),
)

// Requires FolderBrowser and Projects; entrypoints decide how they are built.
export const AppLayer = (options: { readonly staticDir: string }) =>
  Layer.mergeAll(
    ApiLive,
    ApiNotFound,
    HttpStaticServer.layer({ root: options.staticDir, spa: true }),
  )
