// Snapshot is what diffium-db captures from a database at one moment: the
// structure of every object it watches, rendered to canonical text, plus a
// digest of the rows in each table. Everything downstream diffs two of these.

export const SNAPSHOT_VERSION = 1

export type ObjectKind = "table" | "view" | "matview" | "enum" | "function"

/** DbObject is one watched database object, rendered to stable text. */
export type DbObject = {
  key: string // "public.users"
  kind: ObjectKind
  schema: string
  name: string
  ddl: string // canonical definition, deterministic line order
}

/** RowDigest identifies one row and fingerprints its contents. */
export type RowDigest = {
  pk: string // primary key values, joined with "|"
  hash: string
  preview: string // short human-readable rendering of the row
}

/** TableRows is the row-level half of the snapshot for a single table. */
export type TableRows = {
  key: string
  count: number
  /** the columns the digests were taken over, in table order. */
  columns: string[]
  digests: RowDigest[]
  /** true when the table was too large to fingerprint; only count is real. */
  countOnly: boolean
}

export type Snapshot = {
  version: number
  takenAt: string // ISO 8601
  database: string
  schemas: string[]
  objects: DbObject[]
  rows: TableRows[]
}

/** emptySnapshot is the baseline you diff against when nothing was captured. */
export function emptySnapshot(database = "", schemas: string[] = []): Snapshot {
  return {
    version: SNAPSHOT_VERSION,
    takenAt: new Date(0).toISOString(),
    database,
    schemas,
    objects: [],
    rows: [],
  }
}

export function objectByKey(snap: Snapshot): Map<string, DbObject> {
  return new Map(snap.objects.map((o) => [o.key, o]))
}

export function rowsByKey(snap: Snapshot): Map<string, TableRows> {
  return new Map(snap.rows.map((r) => [r.key, r]))
}
