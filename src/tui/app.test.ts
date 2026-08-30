// The screen, driven headless. OpenTUI's test renderer draws into memory, so
// these assertions are made against the same pixels a terminal would get.

import { createTestRenderer } from "@opentui/core/testing"
import { describe, expect, test } from "bun:test"
import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Config } from "../config"
import { rows, snapshot, table } from "../model/fixtures"
import type { Snapshot } from "../model/snapshot"
import type { Store, StoredSnapshot } from "../store/index"
import { createApp } from "./app"
import { defaultPrefs } from "./prefs"
import { defaultTheme } from "./theme"

const cols = ["id", "email"]

const before = snapshot(
  [table("public.users", cols)],
  [
    rows("public.users", cols, [
      ["1", "ada"],
      ["2", "grace"],
    ]),
  ],
)

const after = snapshot(
  [table("public.users", [...cols, "plan"]), table("public.orgs", ["id"])],
  [
    rows("public.users", cols, [
      ["1", "ada"],
      ["2", "grace"],
      ["3", "alan"],
    ]),
  ],
)

function memoryStore(seed: Snapshot): Store {
  const saved = new Map<string, Snapshot>([["baseline", seed]])
  return {
    kind: "local",
    describe: "memory",
    async save(name, snap) {
      saved.set(name, snap)
    },
    async load(name) {
      return saved.get(name) ?? null
    },
    async list(): Promise<StoredSnapshot[]> {
      return [...saved].map(([name, s]) => ({
        name,
        database: s.database,
        takenAt: s.takenAt,
        objects: s.objects.length,
      }))
    },
    async close() {},
  }
}

async function mount(current: Snapshot = after) {
  const root = await mkdtemp(join(tmpdir(), "diffium-db-app-"))
  const config: Config = {
    url: "postgres://unused",
    schemas: ["public"],
    store: { kind: "local", target: join(root, "snapshots") },
    interval: 1000,
    rowLimit: 5000,
    rows: true,
    root,
  }
  const setup = await createTestRenderer({ width: 96, height: 24 })
  const app = await createApp({
    renderer: setup.renderer,
    config,
    store: memoryStore(before),
    baseline: "baseline",
    theme: defaultTheme(),
    prefs: defaultPrefs(),
    captureNow: async () => current,
  })
  const frame = async () => {
    app.paint()
    await setup.renderOnce()
    return setup.captureCharFrame()
  }
  return { app, setup, frame }
}

const key = (sequence: string, name = sequence) => ({ sequence, name }) as never

describe("watch screen", () => {
  test("draws the change list and the diff for the first change", async () => {
    const { app, setup, frame } = await mount()
    await app.refresh()
    const drawn = await frame()

    expect(drawn).toContain("Changes | table public.orgs")
    expect(drawn).toContain("+ table public.orgs")
    expect(drawn).toContain("~ table public.users")
    expect(drawn).toContain("+ rows public.users")
    expect(drawn).toContain("h: help")

    await app.dispose()
    setup.renderer.destroy()
  })

  test("j moves the selection and the header follows it", async () => {
    const { app, setup, frame } = await mount()
    await app.refresh()
    app.onKey(key("j", "j"))
    expect(await frame()).toContain("Changes | table public.users")
    app.onKey(key("k", "k"))
    expect(await frame()).toContain("Changes | table public.orgs")

    await app.dispose()
    setup.renderer.destroy()
  })

  test("the users diff shows the new column on the right and not the left", async () => {
    const { app, setup, frame } = await mount()
    await app.refresh()
    app.onKey(key("j", "j"))
    const drawn = await frame()
    const [, right] = splitPanes(drawn)
    expect(right).toContain("column plan")
    expect(splitPanes(drawn)[0]).not.toContain("column plan")

    await app.dispose()
    setup.renderer.destroy()
  })

  test("s switches to the inline diff", async () => {
    const { app, setup, frame } = await mount()
    await app.refresh()
    app.onKey(key("j", "j"))
    expect(await frame()).toContain("│")
    app.onKey(key("s", "s"))
    const inline = await frame()
    expect(inline).toContain("+   column plan")

    await app.dispose()
    setup.renderer.destroy()
  })

  test("h opens the help panel and h closes it", async () => {
    const { app, setup, frame } = await mount()
    await app.refresh()
    app.onKey(key("h", "h"))
    expect(await frame()).toContain("re-baseline from the current state")
    app.onKey(key("h", "h"))
    expect(await frame()).not.toContain("re-baseline from the current state")

    await app.dispose()
    setup.renderer.destroy()
  })

  test("b then y re-baselines and the list empties", async () => {
    const { app, setup, frame } = await mount()
    await app.refresh()
    expect(app.state.entries.length).toBeGreaterThan(0)

    app.onKey(key("b", "b"))
    expect(await frame()).toContain("re-baseline")
    app.onKey(key("y", "y"))
    await Bun.sleep(10)
    expect(app.state.entries).toHaveLength(0)
    expect(await frame()).toContain("nothing has changed")

    await app.dispose()
    setup.renderer.destroy()
  })

  test("a capture that throws lands in the status bar instead of the floor", async () => {
    const { app, setup, frame } = await mount()
    const broken = await createApp({
      renderer: setup.renderer,
      config: app.state as never,
      store: memoryStore(before),
      baseline: "baseline",
      theme: defaultTheme(),
      prefs: defaultPrefs(),
      captureNow: async () => {
        throw new Error("connection refused")
      },
    })
    await broken.refresh()
    expect(broken.state.status).toContain("connection refused")

    await broken.dispose()
    await app.dispose()
    setup.renderer.destroy()
  })

  test("an empty database against an empty baseline says so", async () => {
    const { app, setup, frame } = await mount(before)
    await app.refresh()
    expect(await frame()).toContain("nothing has changed")

    await app.dispose()
    setup.renderer.destroy()
  })

  test("e writes the whole change list to a file and says where", async () => {
    const { app, setup, frame } = await mount()
    await app.refresh()

    const path = await app.exportDiff()
    const written = await Bun.file(path).text()
    expect(written).toContain("3 changes: 2 structure, 1 rows")
    expect(written).toContain("+ table public.orgs")
    expect(written).toContain("+   column id")

    app.onKey(key("e", "e"))
    await Bun.sleep(10)
    expect(await frame()).toContain("wrote ")

    await app.dispose()
    setup.renderer.destroy()
  })
})

// The panes are one grid; splitting on the divider column is how a reader tells
// the two halves of a side-by-side diff apart.
function splitPanes(drawn: string): [string, string] {
  const left: string[] = []
  const right: string[] = []
  for (const line of drawn.split("\n")) {
    const at = line.indexOf("│", 30)
    if (at === -1) continue
    const rest = line.slice(at + 1)
    const mid = rest.indexOf("│")
    left.push(mid === -1 ? rest : rest.slice(0, mid))
    right.push(mid === -1 ? "" : rest.slice(mid + 1))
  }
  return [left.join("\n"), right.join("\n")]
}
