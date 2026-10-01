import { join } from "node:path"
import { expect, test } from "./fixtures.ts"

// MaxFolderDepth in @convo/api.
const maxDepth = 3

test("the folder API lists nested folders down to a capped depth", async ({
  request,
  folders,
}) => {
  folders.folder("a", "b", "c")
  const a = join(folders.dir, "a")
  const list = (depth: number) =>
    request.get("/api/folders", {
      params: { path: folders.dir, depth: String(depth) },
    })

  expect((await list(maxDepth)).status()).toBe(200)
  const nested = await list(2)
  expect(nested.status()).toBe(200)
  expect(await nested.json()).toMatchObject({
    path: folders.dir,
    isRepoRoot: false,
    entries: [
      {
        name: "a",
        path: a,
        entries: [{ name: "b", path: join(a, "b") }],
      },
    ],
  })
  const [b] = (await nested.json()).entries[0].entries
  expect(b).not.toHaveProperty("entries")

  expect((await list(maxDepth + 1)).status()).toBe(400)
  expect((await list(0)).status()).toBe(400)
})
