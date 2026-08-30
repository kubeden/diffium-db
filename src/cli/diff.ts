import { diffSnapshots } from "../model/diff"
import { entriesOf, summarise } from "../model/entries"
import { loadConfig, type Flags } from "../config"
import { emptySnapshot } from "../model/snapshot"
import { capture, open } from "../pg/capture"
import { openStore } from "../store/index"
import { exportText } from "../tui/app"

export async function runDiff(
  flags: Flags,
  name: string,
  json: boolean,
  exitCode: boolean,
): Promise<void> {
  const config = await loadConfig(flags)
  const sql = open(config.url)
  const store = await openStore(config.store)
  try {
    const baseline = await store.load(name)
    if (!baseline) {
      throw new Error(`no baseline named "${name}" — run: diffium-db snapshot -n ${name}`)
    }
    const current = await capture(sql, {
      schemas: config.schemas,
      rowLimit: config.rowLimit,
      rows: config.rows,
    })
    const entries = entriesOf(diffSnapshots(baseline ?? emptySnapshot(), current))

    if (json) {
      console.log(JSON.stringify({ summary: summarise(entries), entries }, null, 2))
    } else {
      process.stdout.write(exportText(entries, current.database, name))
    }
    if (exitCode && entries.length > 0) process.exit(1)
  } finally {
    await sql.end()
    await store.close()
  }
}
