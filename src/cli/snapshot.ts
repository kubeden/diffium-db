import { loadConfig, type Flags } from "../config"
import { capture, open } from "../pg/capture"
import { openStore } from "../store/index"

export async function runSnapshot(flags: Flags, name: string, json: boolean): Promise<void> {
  const config = await loadConfig(flags)
  const sql = open(config.url)
  const store = await openStore(config.store)
  try {
    const snap = await capture(sql, {
      schemas: config.schemas,
      rowLimit: config.rowLimit,
      rows: config.rows,
    })
    await store.save(name, snap)
    const rows = snap.rows.reduce((n, r) => n + r.count, 0)
    if (json) {
      console.log(
        JSON.stringify({
          name,
          database: snap.database,
          takenAt: snap.takenAt,
          objects: snap.objects.length,
          rows,
          store: store.kind,
        }),
      )
    } else {
      console.log(
        `${name}: ${snap.objects.length} objects, ${rows} rows from ${snap.database} ` +
          `-> ${store.kind} (${store.describe})`,
      )
    }
  } finally {
    await sql.end()
    await store.close()
  }
}
