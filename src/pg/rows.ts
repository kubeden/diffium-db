// Reading rows out of Postgres. A row is identified by its primary key and
// fingerprinted with md5 of the whole record, so an update is one changed hash
// rather than a column-by-column comparison. Tables without a primary key, and
// tables past the fingerprint limit, are counted and nothing more.

import type { SQL } from "bun"
import type { RowDigest, TableRows } from "../model/snapshot"
import { textArray } from "./params"

/** DEFAULT_ROW_LIMIT is how many rows a table may have and still be fingerprinted. */
export const DEFAULT_ROW_LIMIT = 5000

/** PREVIEW_CHARS caps how much of a row the diff pane is asked to show. */
const PREVIEW_CHARS = 300

type PkRow = { schema: string; table: string; cols: string[] }

/** captureRows fingerprints the rows of every table in the given schemas. */
export async function captureRows(
  sql: SQL,
  schemas: string[],
  limit = DEFAULT_ROW_LIMIT,
): Promise<TableRows[]> {
  const tables = (await sql.unsafe(TABLES_SQL, [textArray(schemas)])) as {
    schema: string
    table: string
  }[]
  const pks = (await sql.unsafe(PRIMARY_KEYS_SQL, [textArray(schemas)])) as PkRow[]
  const pkByKey = new Map(pks.map((p) => [`${p.schema}.${p.table}`, p.cols]))
  const cols = (await sql.unsafe(COLUMNS_SQL, [textArray(schemas)])) as PkRow[]
  const colsByKey = new Map(cols.map((c) => [`${c.schema}.${c.table}`, c.cols]))

  const out: TableRows[] = []
  for (const t of tables) {
    const key = `${t.schema}.${t.table}`
    const qualified = `${quote(t.schema)}.${quote(t.table)}`
    const counted = (await sql.unsafe(`select count(*)::bigint as count from ${qualified}`)) as {
      count: string | number
    }[]
    const total = Number(counted[0]?.count ?? 0)

    const columns = colsByKey.get(key) ?? []
    const pkCols = pkByKey.get(key)
    if (!pkCols || total > limit) {
      out.push({ key, count: total, columns, digests: [], countOnly: true })
      continue
    }

    const pkExpr = pkCols.map((c) => `t.${quote(c)}::text`).join(` || '|' || `)
    const rows = (await sql.unsafe(
      `select ${pkExpr} as pk, md5(t::text) as hash, left(t::text, ${PREVIEW_CHARS}) as preview
       from ${qualified} t
       order by ${pkCols.map((c) => `t.${quote(c)}`).join(", ")}`,
    )) as RowDigest[]
    out.push({ key, count: total, columns, digests: rows, countOnly: false })
  }
  out.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
  return out
}

function quote(ident: string): string {
  return `"${ident.replaceAll('"', '""')}"`
}

const TABLES_SQL = `
select n.nspname as schema, c.relname as table
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where c.relkind = 'r' and n.nspname = any($1::text[])
order by 1, 2`

const COLUMNS_SQL = `
select n.nspname as schema, c.relname as table,
       array_agg(a.attname order by a.attnum) as cols
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
where c.relkind = 'r' and n.nspname = any($1::text[])
group by 1, 2`

const PRIMARY_KEYS_SQL = `
select n.nspname as schema, c.relname as table,
       array_agg(a.attname order by k.ord) as cols
from pg_constraint con
join pg_class c on c.oid = con.conrelid
join pg_namespace n on n.oid = c.relnamespace
join lateral unnest(con.conkey) with ordinality as k(attnum, ord) on true
join pg_attribute a on a.attrelid = c.oid and a.attnum = k.attnum
where con.contype = 'p' and n.nspname = any($1::text[])
group by 1, 2`
