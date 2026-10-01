import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/http-api"

// A browser page cannot learn absolute paths, so the server browses folders
// on the Client's behalf.

// A folder and, down to the depth asked for, its subfolders. The folder the
// Client asked for is the top-level entry; only it carries `parent`.
export interface FolderEntry {
  readonly name: string
  readonly path: string
  // The folder is the root of a git repository.
  readonly isRepoRoot: boolean
  // Absent on the top-level entry for `/`, and on every subfolder.
  readonly parent?: string
  // Absent where listing stopped: below the depth asked for, or where the
  // folder could not be read.
  readonly entries?: ReadonlyArray<FolderEntry>
}

export const FolderEntry = Schema.Struct({
  name: Schema.String,
  path: Schema.String,
  isRepoRoot: Schema.Boolean,
  parent: Schema.optionalKey(Schema.String),
  entries: Schema.optionalKey(
    Schema.Array(Schema.suspend((): Schema.Codec<FolderEntry> => FolderEntry)),
  ),
})

// Each level stats every subfolder, so a deep walk of $HOME is never asked
// for in one request.
export const MaxFolderDepth = 3

export class FolderUnavailable extends Schema.TaggedError<FolderUnavailable>()(
  "FolderUnavailable",
  { path: Schema.String, message: Schema.String },
  { httpApiStatus: 404 },
) {}

export const FoldersGroup = HttpApiGroup.make("folders").add(
  HttpApiEndpoint.get("list", "/folders", {
    query: {
      // Absolute, or starting with `~`; the human's home folder if omitted.
      path: Schema.optional(Schema.String),
      hidden: Schema.optional(Schema.Boolean),
      // Levels of subfolders to list; 1 if omitted.
      depth: Schema.optional(
        Schema.Int.check(
          Schema.isBetween({ minimum: 1, maximum: MaxFolderDepth }),
        ),
      ),
    },
    success: FolderEntry,
    error: FolderUnavailable,
  }),
)
