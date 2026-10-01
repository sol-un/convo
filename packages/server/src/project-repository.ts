import { Project, ProjectId } from "@convo/api"
import { Context, Effect, Layer, Option, Schema, Struct } from "effect"
import { SqlClient, SqlSchema } from "effect/sql"

// A Project before the database has given it an id.
const NewProject = Project.mapFields(Struct.omit(["id"]))
type NewProject = typeof NewProject.Type

// Storage for Projects. A failing query is a defect, not a domain error.
export class ProjectRepository extends Context.Service<
  ProjectRepository,
  {
    readonly list: Effect.Effect<ReadonlyArray<Project>>
    // Inserts the Project unless its path is already registered; either way
    // returns the Project stored for that path.
    insertOrGet(project: NewProject): Effect.Effect<Project>
    updateMainBranch(
      id: ProjectId,
      mainBranch: string,
    ): Effect.Effect<Option.Option<Project>>
  }
>()("convo/ProjectRepository") {
  static readonly layer = Layer.effect(
    ProjectRepository,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const columns = sql`id, name, path, main_branch`

      const list = SqlSchema.findAll({
        Request: Schema.Void,
        Result: Project,
        execute: () => sql`SELECT ${columns} FROM projects ORDER BY name, id`,
      })()

      const findByPath = SqlSchema.findOneOption({
        Request: Schema.String,
        Result: Project,
        execute: (path) =>
          sql`SELECT ${columns} FROM projects WHERE path = ${path}`,
      })

      // On a conflict SQLite returns no row, so the caller looks it up.
      const insert = SqlSchema.findOneOption({
        Request: NewProject,
        Result: Project,
        execute: (project) => sql`
          INSERT INTO projects ${sql.insert(project)}
          ON CONFLICT (path) DO NOTHING
          RETURNING ${columns}
        `,
      })

      const updateMainBranch = SqlSchema.findOneOption({
        Request: Schema.Struct({ id: ProjectId, mainBranch: Schema.String }),
        Result: Project,
        execute: ({ id, mainBranch }) => sql`
          UPDATE projects SET main_branch = ${mainBranch}
          WHERE id = ${id}
          RETURNING ${columns}
        `,
      })

      const insertOrGet = (project: NewProject) =>
        Effect.gen(function* () {
          const inserted = yield* insert(project)
          if (Option.isSome(inserted)) {
            return inserted.value
          }
          const existing = yield* findByPath(project.path)
          if (Option.isNone(existing)) {
            return yield* Effect.die(
              `Project at ${project.path} is neither inserted nor stored`,
            )
          }
          return existing.value
        }).pipe(sql.withTransaction)

      return ProjectRepository.of({
        list: Effect.orDie(list),
        insertOrGet: (project) => Effect.orDie(insertOrGet(project)),
        updateMainBranch: (id, mainBranch) =>
          Effect.orDie(updateMainBranch({ id, mainBranch })),
      })
    }),
  )
}
