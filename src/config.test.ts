import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DIR, loadConfig } from "./config"

let root: string
const saved = { ...process.env }

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "diffium-db-cfg-"))
  delete process.env.DATABASE_URL
  delete process.env.DIFFIUM_DB_URL
  delete process.env.DIFFIUM_DB_STORE
  delete process.env.DIFFIUM_DB_STORE_URL
})

afterEach(() => {
  process.env = { ...saved }
})

async function writeConfig(body: object) {
  await mkdir(join(root, DIR), { recursive: true })
  await writeFile(join(root, DIR, "config.json"), JSON.stringify(body), "utf8")
}

describe("loadConfig", () => {
  test("a flag beats the environment", async () => {
    process.env.DATABASE_URL = "postgres://from-env"
    const config = await loadConfig({ url: "postgres://from-flag", root })
    expect(config.url).toBe("postgres://from-flag")
  })

  test("the environment beats the file", async () => {
    await writeConfig({ url: "postgres://from-file" })
    process.env.DATABASE_URL = "postgres://from-env"
    expect((await loadConfig({ root })).url).toBe("postgres://from-env")
  })

  test("the file is the last word", async () => {
    await writeConfig({ url: "postgres://from-file", interval: 250 })
    const config = await loadConfig({ root })
    expect(config.url).toBe("postgres://from-file")
    expect(config.interval).toBe(250)
  })

  test("no url anywhere is an error that says what to do", async () => {
    await expect(loadConfig({ root })).rejects.toThrow(/no database url/)
  })

  test("the local store lands under the project directory", async () => {
    const config = await loadConfig({ url: "postgres://x", root })
    expect(config.store).toEqual({
      kind: "local",
      target: join(root, DIR, "snapshots"),
    })
  })

  test("the neon store needs a url of its own", async () => {
    await expect(loadConfig({ url: "postgres://x", store: "neon", root })).rejects.toThrow(
      /store neon needs a url/,
    )
  })

  test("an unknown store is refused by name", async () => {
    await expect(loadConfig({ url: "postgres://x", store: "s3", root })).rejects.toThrow(
      /unknown store: s3/,
    )
  })

  test("defaults are the ones documented", async () => {
    const config = await loadConfig({ url: "postgres://x", root })
    expect(config.interval).toBe(1000)
    expect(config.rowLimit).toBe(5000)
    expect(config.rows).toBe(true)
    expect(config.schemas).toEqual([])
  })

  test("--no-rows turns the row half off", async () => {
    expect((await loadConfig({ url: "postgres://x", rows: false, root })).rows).toBe(false)
  })
})
