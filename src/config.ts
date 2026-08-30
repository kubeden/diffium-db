// Resolving what to watch and where the baseline lives. Flags win, then the
// environment, then .diffium-db/config.json next to the project you are in.

import { readFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import type { StoreSpec } from "./store/index"

/** DIR is the per-project directory, the way diffium uses .diffium. */
export const DIR = ".diffium-db"

export type Config = {
  /** connection url of the database being watched. */
  url: string
  /** schemas to watch; empty means every non-system schema. */
  schemas: string[]
  /** where baselines are kept. */
  store: StoreSpec
  /** how often watch re-captures, in milliseconds. */
  interval: number
  /** tables past this many rows are counted, not fingerprinted. */
  rowLimit: number
  /** false watches structure only. */
  rows: boolean
  /** project root — the directory .diffium-db lives in. */
  root: string
}

export type FileConfig = Partial<{
  url: string
  schemas: string[]
  store: "local" | "neon"
  storeUrl: string
  interval: number
  rowLimit: number
  rows: boolean
}>

export type Flags = {
  url?: string
  schema?: string[]
  store?: string
  storeUrl?: string
  interval?: number
  rowLimit?: number
  rows?: boolean
  root?: string
}

export async function loadConfig(flags: Flags): Promise<Config> {
  const root = resolve(flags.root ?? process.cwd())
  const file = await readFileConfig(join(root, DIR, "config.json"))

  const url = flags.url ?? process.env.DIFFIUM_DB_URL ?? process.env.DATABASE_URL ?? file.url
  if (!url) {
    throw new Error(
      "no database url: pass --url, set DATABASE_URL, or put one in " + `${DIR}/config.json`,
    )
  }

  const storeKind = (flags.store ?? process.env.DIFFIUM_DB_STORE ?? file.store ?? "local") as
    "local" | "neon"
  if (storeKind !== "local" && storeKind !== "neon") {
    throw new Error(`unknown store: ${storeKind} (want "local" or "neon")`)
  }

  let store: StoreSpec
  if (storeKind === "neon") {
    const target = flags.storeUrl ?? process.env.DIFFIUM_DB_STORE_URL ?? file.storeUrl
    if (!target) {
      throw new Error("store neon needs a url: pass --store-url or set DIFFIUM_DB_STORE_URL")
    }
    store = { kind: "neon", target }
  } else {
    store = { kind: "local", target: join(root, DIR, "snapshots") }
  }

  return {
    url,
    schemas: flags.schema ?? file.schemas ?? [],
    store,
    interval: flags.interval ?? file.interval ?? 1000,
    rowLimit: flags.rowLimit ?? file.rowLimit ?? 5000,
    rows: flags.rows ?? file.rows ?? true,
    root,
  }
}

async function readFileConfig(path: string): Promise<FileConfig> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as FileConfig
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return {}
    throw new Error(`reading ${path}: ${(err as Error).message}`)
  }
}
