// The neon store: baselines kept in Postgres, in diffium-db's own schema. Neon
// is the backend it was built against, but this is ordinary SQL and any
// Postgres will do. The schema is excluded from every capture, so pointing the
// store at the database you are watching does not make it watch itself.

import { SQL } from "bun"
import type { Snapshot } from "../model/snapshot"
import { STORE_SCHEMA } from "../pg/introspect"
import type { Store, StoredSnapshot } from "./index"

export async function openNeonStore(url: string): Promise<Store> {
  const sql = new SQL(url, { max: 2 })
  await sql.unsafe(`create schema if not exists ${STORE_SCHEMA}`)
  await sql.unsafe(`
    create table if not exists ${STORE_SCHEMA}.snapshots (
      name      text primary key,
      database  text        not null,
      taken_at  timestamptz not null,
      payload   jsonb       not null
    )`)

  return {
    kind: "neon",
    describe: hostOf(url),

    async save(name, snap) {
      // The snapshot goes over as an object, not as JSON text: Bun encodes a
      // string param bound to json as a json *string*, and the row comes back
      // double-quoted with every jsonb operator on it useless.
      await sql.unsafe(
        `insert into ${STORE_SCHEMA}.snapshots (name, database, taken_at, payload)
         values ($1, $2, $3, $4)
         on conflict (name) do update
           set database = excluded.database,
               taken_at = excluded.taken_at,
               payload  = excluded.payload`,
        [name, snap.database, snap.takenAt, snap as unknown as string],
      )
    },

    async load(name) {
      const rows = (await sql.unsafe(
        `select payload from ${STORE_SCHEMA}.snapshots where name = $1`,
        [name],
      )) as { payload: Snapshot | string }[]
      const row = rows[0]
      if (!row) return null
      return typeof row.payload === "string" ? (JSON.parse(row.payload) as Snapshot) : row.payload
    },

    async list() {
      const rows = (await sql.unsafe(
        `select name, database, taken_at, jsonb_array_length(payload -> 'objects') as objects
         from ${STORE_SCHEMA}.snapshots
         order by taken_at desc`,
      )) as {
        name: string
        database: string
        taken_at: string | Date
        objects: number
      }[]
      return rows.map((r): StoredSnapshot => ({
        name: r.name,
        database: r.database,
        takenAt: new Date(r.taken_at).toISOString(),
        objects: Number(r.objects),
      }))
    },

    async close() {
      await sql.end()
    },
  }
}

// Connection urls carry credentials; only the host ever reaches the screen.
function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return "postgres"
  }
}
