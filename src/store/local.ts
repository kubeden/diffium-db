// The local store: one JSON file per named snapshot under .diffium-db/snapshots.
// Plain text on purpose — a baseline you can read, diff and commit.

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import type { Snapshot } from "../model/snapshot"
import type { Store, StoredSnapshot } from "./index"

export async function openLocalStore(dir: string): Promise<Store> {
  await mkdir(dir, { recursive: true })

  return {
    kind: "local",
    describe: dir,

    async save(name, snap) {
      await writeFile(pathFor(dir, name), JSON.stringify(snap, null, 2) + "\n", "utf8")
    },

    async load(name) {
      try {
        return JSON.parse(await readFile(pathFor(dir, name), "utf8")) as Snapshot
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return null
        throw err
      }
    },

    async list() {
      const out: StoredSnapshot[] = []
      for (const file of await readdir(dir)) {
        if (!file.endsWith(".json")) continue
        const snap = JSON.parse(await readFile(join(dir, file), "utf8")) as Snapshot
        out.push({
          name: file.slice(0, -".json".length),
          database: snap.database,
          takenAt: snap.takenAt,
          objects: snap.objects.length,
        })
      }
      out.sort((a, b) => (a.takenAt < b.takenAt ? 1 : -1))
      return out
    },

    async close() {},
  }
}

function pathFor(dir: string, name: string): string {
  return join(dir, `${safeName(name)}.json`)
}

// Snapshot names reach the filesystem, so keep them to something a filename can
// hold without surprises.
function safeName(name: string): string {
  const clean = name.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[.\-]+|[.\-]+$/g, "")
  if (!clean) throw new Error(`invalid snapshot name: ${JSON.stringify(name)}`)
  return clean
}
