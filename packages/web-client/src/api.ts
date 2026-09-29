import type { Health } from "@convo/api"

// A small fetch wrapper; the Client knows the API only through the types
// exported by @convo/api.
async function getJson<A>(path: string): Promise<A> {
  const response = await fetch(path, {
    headers: { accept: "application/json" },
  })
  if (!response.ok) {
    throw new Error(`GET ${path} failed with ${response.status}`)
  }
  return (await response.json()) as A
}

export const api = {
  health: () => getJson<Health>("/api/health"),
}
