import { Schema } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiGroup } from "effect/http-api"
import { FoldersGroup } from "./folders.ts"
import { ProjectsGroup } from "./projects.ts"

export * from "./folders.ts"
export * from "./projects.ts"

export const Health = Schema.Struct({
  status: Schema.Literal("ok"),
})
export type Health = typeof Health.Type

export const HealthGroup = HttpApiGroup.make("health").add(
  HttpApiEndpoint.get("check", "/health", { success: Health }),
)

export const ConvoApi = HttpApi.make("convo")
  .add(HealthGroup)
  .add(FoldersGroup)
  .add(ProjectsGroup)
  .prefix("/api")
