import type { Project } from "@convo/api"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { api } from "@/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export function ProjectPane({ project }: { project: Project }) {
  return (
    <section aria-labelledby="project-title" className="flex flex-col gap-6">
      <header>
        <h2 id="project-title" className="text-2xl font-semibold">
          {project.name}
        </h2>
        <p className="font-mono text-sm text-muted-foreground">
          {project.path}
        </p>
      </header>
      {/* Remounted per Project so the form starts from its stored value. */}
      <MainBranchForm key={project.id} project={project} />
    </section>
  )
}

function MainBranchForm({ project }: { project: Project }) {
  const queryClient = useQueryClient()
  const [mainBranch, setMainBranch] = useState(project.mainBranch)
  const save = useMutation({
    mutationFn: (branch: string) =>
      api.updateProject(project.id, { mainBranch: branch }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["projects"] }),
  })
  const trimmed = mainBranch.trim()

  return (
    <form
      className="flex max-w-md flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        save.mutate(trimmed)
      }}
    >
      <label htmlFor="main-branch" className="text-sm font-medium">
        Main branch
      </label>
      <div className="flex gap-2">
        <Input
          id="main-branch"
          value={mainBranch}
          onChange={(event) => {
            save.reset()
            setMainBranch(event.target.value)
          }}
          spellCheck={false}
          className="font-mono"
        />
        <Button
          type="submit"
          disabled={
            trimmed === "" || trimmed === project.mainBranch || save.isPending
          }
        >
          Save
        </Button>
      </div>
      {save.isSuccess && (
        <p role="status" className="text-sm text-muted-foreground">
          Saved
        </p>
      )}
      {save.isError && (
        <p role="alert" className="text-sm text-destructive">
          Could not save the main branch
        </p>
      )}
    </form>
  )
}
