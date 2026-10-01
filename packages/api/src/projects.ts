import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/http-api"
import { FolderUnavailable } from "./folders.ts"

export const ProjectId = Schema.Int.pipe(Schema.brand("ProjectId"))
export type ProjectId = typeof ProjectId.Type

export const Project = Schema.Struct({
  id: ProjectId,
  name: Schema.String,
  path: Schema.String,
  mainBranch: Schema.String,
})
export type Project = typeof Project.Type

export class InsideRepository extends Schema.TaggedError<InsideRepository>()(
  "InsideRepository",
  { path: Schema.String, root: Schema.String },
  { httpApiStatus: 409 },
) {}

export class NotInRepository extends Schema.TaggedError<NotInRepository>()(
  "NotInRepository",
  { path: Schema.String },
  { httpApiStatus: 422 },
) {}

export class ProjectNotFound extends Schema.TaggedError<ProjectNotFound>()(
  "ProjectNotFound",
  { id: ProjectId },
  { httpApiStatus: 404 },
) {}

const BranchName = Schema.Trimmed.check(Schema.isNonEmpty())

export const ProjectsGroup = HttpApiGroup.make("projects").add(
  HttpApiEndpoint.get("list", "/projects", {
    success: Schema.Array(Project),
  }),
  HttpApiEndpoint.post("open", "/projects", {
    // Answers with the Project already registered at the path, if any.
    payload: Schema.Struct({ path: Schema.String }),
    success: Project,
    error: [FolderUnavailable, InsideRepository, NotInRepository],
  }),
  HttpApiEndpoint.patch("update", "/projects/:id", {
    params: { id: ProjectId },
    payload: Schema.Struct({ mainBranch: BranchName }),
    success: Project,
    error: ProjectNotFound,
  }),
)
