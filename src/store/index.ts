// Where baselines live. A store keeps named snapshots and hands them back; the
// local store is a directory of JSON files and needs no setup, the neon store
// keeps them in Postgres so a team or a CI job can share one baseline.

import type { Snapshot } from "../model/snapshot"

export type StoreKind = "local" | "neon"

/** StoredSnapshot is what a listing shows without loading the whole payload. */
export type StoredSnapshot = {
  name: string
  database: string
  takenAt: string
  objects: number
}

export type Store = {
  readonly kind: StoreKind
  /** describe is what the TUI shows in the status bar. */
  readonly describe: string
  save(name: string, snap: Snapshot): Promise<void>
  load(name: string): Promise<Snapshot | null>
  list(): Promise<StoredSnapshot[]>
  close(): Promise<void>
}

export type StoreSpec = {
  kind: StoreKind
  /** local: directory to keep snapshots in. neon: connection url. */
  target: string
}

export async function openStore(spec: StoreSpec): Promise<Store> {
  if (spec.kind === "neon") {
    const { openNeonStore } = await import("./neon")
    return openNeonStore(spec.target)
  }
  const { openLocalStore } = await import("./local")
  return openLocalStore(spec.target)
}
