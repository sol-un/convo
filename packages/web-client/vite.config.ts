import { fileURLToPath } from "node:url"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, type Plugin } from "vite"

// The web Client may import only types from @convo/api and never Effect.
// Type-only imports are erased before module resolution, so any of these
// specifiers reaching resolveId is a runtime import.
const typesOnlyFromApi = (): Plugin => ({
  name: "convo:types-only-from-api",
  enforce: "pre",
  resolveId(source, importer) {
    if (/^(effect|@effect\/|@convo\/api)(\/|$)/.test(source)) {
      this.error(
        `${importer} imports "${source}" at runtime; the web Client may import only types from @convo/api.`,
      )
    }
  },
})

const serverPort = process.env.CONVO_PORT ?? "4317"

export default defineConfig({
  plugins: [typesOnlyFromApi(), react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  build: {
    outDir: "../server/dist/public",
    emptyOutDir: true,
  },
  server: {
    proxy: { "/api": `http://127.0.0.1:${serverPort}` },
  },
})
