import type {
  FolderEntry,
  FolderUnavailable,
  Health,
  InsideRepository,
  NotInRepository,
  Project,
  ProjectId,
  ProjectNotFound,
} from "@convo/api"

export type FolderError = (typeof FolderUnavailable)["Encoded"]
export type OpenProjectError =
  | FolderError
  | (typeof InsideRepository)["Encoded"]
  | (typeof NotInRepository)["Encoded"]
export type UpdateProjectError = (typeof ProjectNotFound)["Encoded"]

// A failed request, carrying the server's tagged error when it sent one.
export class ApiError<E extends { readonly _tag: string }> extends Error {
  readonly status: number
  readonly body: E | undefined

  constructor(status: number, body: E | undefined) {
    super(`Request failed with ${status}`)
    this.status = status
    this.body = body
  }
}

// A small fetch wrapper; the Client knows the API only through the types
// exported by @convo/api.
async function request<A, E extends { readonly _tag: string } = never>(
  method: string,
  path: string,
  payload?: unknown,
): Promise<A> {
  const response = await fetch(path, {
    method,
    headers: {
      accept: "application/json",
      ...(payload === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  })
  if (!response.ok) {
    const body = await response.json().catch(() => undefined)
    const tagged = typeof body?._tag === "string" ? (body as E) : undefined
    throw new ApiError<E>(response.status, tagged)
  }
  return (await response.json()) as A
}

export const api = {
  health: () => request<Health>("GET", "/api/health"),
  listFolders: (options: { path: string | undefined; hidden: boolean }) => {
    const query = new URLSearchParams({ hidden: String(options.hidden) })
    if (options.path !== undefined) query.set("path", options.path)
    return request<FolderEntry, FolderError>("GET", `/api/folders?${query}`)
  },
  listProjects: () => request<ReadonlyArray<Project>>("GET", "/api/projects"),
  openProject: (path: string) =>
    request<Project, OpenProjectError>("POST", "/api/projects", { path }),
  updateProject: (id: ProjectId, changes: { mainBranch: string }) =>
    request<Project, UpdateProjectError>(
      "PATCH",
      `/api/projects/${id}`,
      changes,
    ),
}
