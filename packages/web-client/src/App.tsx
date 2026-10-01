import type { ProjectId } from "@convo/api"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { api } from "@/api"
import { FolderBrowserDialog } from "@/components/FolderBrowserDialog"
import { ProjectPane } from "@/components/ProjectPane"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

// A throwaway layout: the Project list in a sidebar and the selected Project
// beside it.
export function App() {
  const health = useQuery({ queryKey: ["health"], queryFn: api.health })
  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: api.listProjects,
  })
  const [selectedId, setSelectedId] = useState<ProjectId | undefined>()
  const [browsing, setBrowsing] = useState(false)
  const selected = projects.data?.find((project) => project.id === selectedId)

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-64 shrink-0 flex-col gap-4 border-r p-4">
        <h1 className="text-lg font-semibold">convo</h1>
        <Button variant="outline" onClick={() => setBrowsing(true)}>
          Open Folder…
        </Button>
        <nav aria-label="Projects" className="flex-1">
          {projects.isSuccess && projects.data.length > 0 && (
            <ul className="flex flex-col gap-1">
              {projects.data.map((project) => (
                <li key={project.id}>
                  <button
                    type="button"
                    aria-current={
                      project.id === selectedId ? "true" : undefined
                    }
                    title={project.path}
                    onClick={() => setSelectedId(project.id)}
                    className={cn(
                      "w-full truncate rounded-md px-2 py-1 text-left text-sm hover:bg-accent",
                      project.id === selectedId && "bg-accent font-medium",
                    )}
                  >
                    {project.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {projects.isSuccess && projects.data.length === 0 && (
            <p className="text-sm text-muted-foreground">No Projects yet</p>
          )}
        </nav>
        <footer className="text-xs text-muted-foreground">
          {health.isPending && <p>Checking…</p>}
          {health.isError && (
            <p className="text-destructive">Server unreachable</p>
          )}
          {health.isSuccess && (
            <p data-testid="health-status">Server: {health.data.status}</p>
          )}
        </footer>
      </aside>

      <main className="flex-1 p-8">
        {selected ? (
          <ProjectPane project={selected} />
        ) : (
          <p className="text-muted-foreground">
            Open a folder to register a git repository as a Project.
          </p>
        )}
      </main>

      <FolderBrowserDialog
        open={browsing}
        onClose={() => setBrowsing(false)}
        onOpened={(project) => {
          setSelectedId(project.id)
          setBrowsing(false)
        }}
      />
    </div>
  )
}
