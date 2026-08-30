#!/usr/bin/env bun
import { execute } from "./cli/root"

try {
  await execute(process.argv.slice(2))
} catch (err) {
  console.error(`diffium-db: ${(err as Error).message}`)
  process.exit(1)
}
