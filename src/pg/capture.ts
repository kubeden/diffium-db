// One capture: connect, read structure, read rows, hand back a Snapshot.

import { SQL } from "bun"
import { SNAPSHOT_VERSION, type Snapshot } from "../model/snapshot"
import { captureStructure, watchedSchemas } from "./introspect"
import { captureRows, DEFAULT_ROW_LIMIT } from "./rows"

export type CaptureOptions = {
  /** schemas to watch; empty means every non-system schema in the database. */
  schemas?: string[]
  /** rows past this count per table are counted but not fingerprinted. */
  rowLimit?: number
  /** false skips the row half entirely — structure only, and much cheaper. */
  rows?: boolean
}

/** open returns a client for a Postgres url. Callers close it. */
export function open(url: string): SQL {
  return new SQL(url, { max: 2 })
}

/** capture takes one snapshot of the database behind the given client. */
export async function capture(sql: SQL, opts: CaptureOptions = {}): Promise<Snapshot> {
  const schemas = opts.schemas?.length ? opts.schemas : await watchedSchemas(sql)
  const dbRows = (await sql.unsafe("select current_database() as database")) as {
    database: string
  }[]
  const database = dbRows[0]?.database ?? ""

  const objects = await captureStructure(sql, schemas)
  const rows =
    opts.rows === false ? [] : await captureRows(sql, schemas, opts.rowLimit ?? DEFAULT_ROW_LIMIT)

  return {
    version: SNAPSHOT_VERSION,
    takenAt: new Date().toISOString(),
    database,
    schemas,
    objects,
    rows,
  }
}
