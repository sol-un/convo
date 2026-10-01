import { SqliteClient, SqliteMigrator } from "@effect/sql-sqlite-node"
import { Effect, Layer, String as Str } from "effect"
import { SqlClient } from "effect/sql"

// Migrations run once each, in id order, at startup. They are inlined rather
// than loaded from disk so the bundled server stays a single file.
const migrations = SqliteMigrator.fromRecord({
  "0001_create_projects": Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`
      CREATE TABLE projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        path TEXT NOT NULL UNIQUE,
        main_branch TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `
  }),
})

export const Database = {
  // `filename` is a path to `convo.db`, or `:memory:` in tests.
  layer: (options: { readonly filename: string }) =>
    SqliteMigrator.layer({ loader: migrations }).pipe(
      Layer.provideMerge(
        SqliteClient.layer({
          filename: options.filename,
          transformQueryNames: Str.camelToSnake,
          transformResultNames: Str.snakeToCamel,
        }),
      ),
    ),
}
