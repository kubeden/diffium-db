import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { snapshot, table } from "../model/fixtures"
import { openLocalStore } from "./local"

const dirs: string[] = []

async function tempStore() {
  const dir = await mkdtemp(join(tmpdir(), "diffium-db-"))
  dirs.push(dir)
  return openLocalStore(join(dir, "snapshots"))
}

afterEach(async () => {
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true })
})

describe("local store", () => {
  test("a saved snapshot comes back the same", async () => {
    const store = await tempStore()
    const snap = snapshot([table("public.users", ["id"])])
    await store.save("baseline", snap)
    expect(await store.load("baseline")).toEqual(snap)
  })

  test("an unknown name is null, not an error", async () => {
    const store = await tempStore()
    expect(await store.load("nope")).toBeNull()
  })

  test("saving twice replaces rather than accumulating", async () => {
    const store = await tempStore()
    await store.save("baseline", snapshot([table("public.users", ["id"])]))
    await store.save("baseline", snapshot([table("public.orgs", ["id"])]))
    const listed = await store.list()
    expect(listed).toHaveLength(1)
    expect((await store.load("baseline"))!.objects[0]!.key).toBe("public.orgs")
  })

  test("listing reports what is stored without loading it whole", async () => {
    const store = await tempStore()
    await store.save("before", snapshot([table("public.users", ["id"])]))
    const [entry] = await store.list()
    expect(entry).toMatchObject({
      name: "before",
      database: "demo",
      objects: 1,
    })
  })

  test("a name that would climb out of the directory is flattened, not followed", async () => {
    const store = await tempStore()
    await store.save("../sneaky", snapshot([table("public.users", ["id"])]))
    const listed = await store.list()
    expect(listed).toHaveLength(1)
    expect(listed[0]!.name).toBe("sneaky")
  })
})
