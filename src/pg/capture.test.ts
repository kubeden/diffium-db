// The only tests that need a database. They are skipped unless
// DIFFIUM_DB_TEST_URL points at a Postgres you do not mind them writing to:
// each one works inside a schema of its own and drops it again.

import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import type { SQL } from "bun"
import { diffSnapshots } from "../model/diff"
import { entriesOf } from "../model/entries"
import { capture, open } from "./capture"

const url = process.env.DIFFIUM_DB_TEST_URL
const schema = `ddb_test_${Math.random().toString(36).slice(2, 8)}`
const suite = url ? describe : describe.skip

suite("capture against postgres", () => {
  let sql: SQL

  beforeAll(async () => {
    sql = open(url!)
    await sql.unsafe(`create schema ${schema}`)
    await sql.unsafe(`
      create table ${schema}.users (
        id    bigserial primary key,
        email text      not null unique,
        name  text
      )`)
    await sql.unsafe(`create index users_name_idx on ${schema}.users (name)`)
    await sql.unsafe(
      `insert into ${schema}.users (email, name) values ('ada@example.com', 'Ada'), ('grace@example.com', 'Grace')`,
    )
  })

  afterAll(async () => {
    await sql.unsafe(`drop schema ${schema} cascade`)
    await sql.end()
  })

  test("a table comes back as columns, constraints and indexes", async () => {
    const snap = await capture(sql, { schemas: [schema] })
    const users = snap.objects.find((o) => o.key === `${schema}.users`)!
    expect(users.kind).toBe("table")
    expect(users.ddl).toContain("column email text not null")
    expect(users.ddl).toContain("constraint users_pkey PRIMARY KEY (id)")
    expect(users.ddl).toContain("index users_name_idx btree (name)")
  })

  test("an index backing a constraint is not listed twice", async () => {
    const snap = await capture(sql, { schemas: [schema] })
    const users = snap.objects.find((o) => o.key === `${schema}.users`)!
    expect(users.ddl).toContain("constraint users_email_key UNIQUE (email)")
    expect(users.ddl).not.toContain("index users_email_key")
  })

  test("rows come back fingerprinted and keyed by the primary key", async () => {
    const snap = await capture(sql, { schemas: [schema] })
    const users = snap.rows.find((r) => r.key === `${schema}.users`)!
    expect(users.count).toBe(2)
    expect(users.countOnly).toBe(false)
    expect(users.columns).toEqual(["id", "email", "name"])
    expect(users.digests.map((d) => d.pk)).toEqual(["1", "2"])
  })

  test("capturing twice with nothing between is no diff at all", async () => {
    const a = await capture(sql, { schemas: [schema] })
    const b = await capture(sql, { schemas: [schema] })
    expect(entriesOf(diffSnapshots(a, b))).toHaveLength(0)
  })

  test("a migration and an edit both show up, and are told apart", async () => {
    const before = await capture(sql, { schemas: [schema] })
    await sql.unsafe(`alter table ${schema}.users add column plan text not null default 'free'`)
    await sql.unsafe(`update ${schema}.users set name = 'Grace Hopper' where id = 2`)
    await sql.unsafe(`insert into ${schema}.users (email) values ('alan@example.com')`)
    const after = await capture(sql, { schemas: [schema] })

    const entries = entriesOf(diffSnapshots(before, after))
    const structure = entries.find((e) => e.source === "structure")!
    expect(structure.title).toBe(`table ${schema}.users`)
    expect(structure.stat).toBe("+1 -0")

    const rows = diffSnapshots(before, after).rows[0]!
    expect(rows.inserted.map((r) => r.pk)).toEqual(["3"])
    expect(rows.deleted).toHaveLength(0)
    expect(rows.shapeChanged).toBe(true)
    expect(rows.columnsAdded).toEqual(["plan"])
  })

  test("a table past the row limit is counted and not fingerprinted", async () => {
    const snap = await capture(sql, { schemas: [schema], rowLimit: 1 })
    const users = snap.rows.find((r) => r.key === `${schema}.users`)!
    expect(users.countOnly).toBe(true)
    expect(users.digests).toHaveLength(0)
    expect(users.count).toBeGreaterThan(1)
  })

  test("rows: false skips the row half entirely", async () => {
    const snap = await capture(sql, { schemas: [schema], rows: false })
    expect(snap.rows).toHaveLength(0)
    expect(snap.objects.length).toBeGreaterThan(0)
  })
})
