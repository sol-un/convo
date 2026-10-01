import { execSync } from "node:child_process"

// Every worker starts its own server from this one build.
export default function globalSetup() {
  execSync("pnpm build", { stdio: "inherit" })
}
