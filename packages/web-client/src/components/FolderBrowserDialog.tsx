import type { Project } from "@convo/api"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"
import { ApiError, api, type OpenProjectError } from "@/api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

// "Open Folder…": browse the server's folders, starting at the human's home,
// and register the chosen git repo root as a Project.
export function FolderBrowserDialog({
  open,
  onClose,
  onOpened,
}: {
  open: boolean
  onClose: () => void
  onOpened: (project: Project) => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    if (open) dialog.current?.showModal()
    else dialog.current?.close()
  }, [open])

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      aria-labelledby="folder-browser-title"
      className="m-auto w-[min(40rem,calc(100vw-2rem))] rounded-xl border bg-card p-0 text-card-foreground shadow-lg backdrop:bg-black/40"
    >
      {open && <FolderBrowser onClose={onClose} onOpened={onOpened} />}
    </dialog>
  )
}

function FolderBrowser({
  onClose,
  onOpened,
}: {
  onClose: () => void
  onOpened: (project: Project) => void
}) {
  const queryClient = useQueryClient()
  // Undefined until the human navigates: the server starts at $HOME.
  const [path, setPath] = useState<string | undefined>(undefined)
  const [draft, setDraft] = useState("")
  const [hidden, setHidden] = useState(false)

  const listing = useQuery({
    queryKey: ["folders", path, hidden],
    queryFn: () => api.listFolders({ path, hidden }),
    retry: false,
  })

  // The path bar shows where the server actually is (`~` expanded, etc.).
  const shownPath = listing.data?.path
  useEffect(() => {
    if (shownPath !== undefined) setDraft(shownPath)
  }, [shownPath])

  const openProject = useMutation({
    mutationFn: api.openProject,
    onSuccess: async (project) => {
      await queryClient.invalidateQueries({ queryKey: ["projects"] })
      onOpened(project)
    },
  })

  const navigate = (to: string) => {
    openProject.reset()
    setPath(to)
  }

  // One level is listed, so the folder's entries are always loaded.
  const subfolders = listing.data?.entries ?? []
  const listingError =
    listing.error instanceof ApiError ? listing.error.body : undefined
  const openError =
    openProject.error instanceof ApiError
      ? (openProject.error.body as OpenProjectError | undefined)
      : undefined

  return (
    <div className="flex max-h-[80vh] flex-col gap-4 p-6">
      <h2 id="folder-browser-title" className="text-lg font-semibold">
        Open Folder
      </h2>

      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          navigate(draft.trim())
        }}
      >
        <Button
          variant="outline"
          disabled={!listing.data?.parent}
          onClick={() => {
            const parent = listing.data?.parent
            if (parent) navigate(parent)
          }}
        >
          Up
        </Button>
        <Input
          aria-label="Path"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          spellCheck={false}
          className="font-mono"
        />
        <Button type="submit" variant="secondary">
          Go
        </Button>
      </form>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={hidden}
          onChange={(event) => setHidden(event.target.checked)}
        />
        Show hidden folders
      </label>

      <div className="min-h-48 overflow-y-auto rounded-md border">
        {listing.isPending && (
          <p className="p-3 text-sm text-muted-foreground">Loading…</p>
        )}
        {listing.isError && (
          <p role="alert" className="p-3 text-sm text-destructive">
            {listingError
              ? `${listingError.path}: ${listingError.message}`
              : "Could not list this folder"}
          </p>
        )}
        {listing.isSuccess && subfolders.length === 0 && (
          <p className="p-3 text-sm text-muted-foreground">No folders here</p>
        )}
        {listing.isSuccess && subfolders.length > 0 && (
          <ul aria-label="Folders" className="divide-y">
            {subfolders.map((entry) => (
              <li key={entry.path}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-accent"
                  onClick={() => navigate(entry.path)}
                >
                  <span className="truncate">{entry.name}</span>
                  {entry.isRepoRoot && <Badge>git</Badge>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {openError?._tag === "InsideRepository" && (
        <div
          role="alert"
          className="flex items-center justify-between gap-4 rounded-md border p-3 text-sm"
        >
          <p>
            This folder is inside the git repository at{" "}
            <code className="font-mono">{openError.root}</code>.
          </p>
          <Button size="sm" onClick={() => openProject.mutate(openError.root)}>
            Open repository root
          </Button>
        </div>
      )}
      {openError?._tag === "NotInRepository" && (
        <p role="alert" className="text-sm text-destructive">
          <code className="font-mono">{openError.path}</code> is not inside a
          git repository. Only git repositories can be opened as Projects.
        </p>
      )}
      {openError?._tag === "FolderUnavailable" && (
        <p role="alert" className="text-sm text-destructive">
          {openError.path}: {openError.message}
        </p>
      )}
      {openProject.isError && openError === undefined && (
        <p role="alert" className="text-sm text-destructive">
          Could not open this folder
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          disabled={!listing.isSuccess || openProject.isPending}
          onClick={() => {
            if (listing.data) openProject.mutate(listing.data.path)
          }}
        >
          Open
        </Button>
      </div>
    </div>
  )
}
