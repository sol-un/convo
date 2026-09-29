import { useQuery } from "@tanstack/react-query"
import { api } from "@/api"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export function App() {
  const health = useQuery({ queryKey: ["health"], queryFn: api.health })

  return (
    <main className="mx-auto max-w-md p-8">
      <Card>
        <CardHeader>
          <CardTitle>convo</CardTitle>
          <CardDescription>Server health</CardDescription>
        </CardHeader>
        <CardContent>
          {health.isPending && <p>Checking…</p>}
          {health.isError && (
            <p className="text-destructive">Server unreachable</p>
          )}
          {health.isSuccess && (
            <p data-testid="health-status">Server: {health.data.status}</p>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
