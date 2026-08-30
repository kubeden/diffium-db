import { loadConfig, type Flags } from "../config"
import { openStore } from "../store/index"

export async function runBaselines(flags: Flags, json: boolean): Promise<void> {
  const config = await loadConfig(flags)
  const store = await openStore(config.store)
  try {
    const stored = await store.list()
    if (json) {
      console.log(JSON.stringify(stored, null, 2))
      return
    }
    if (stored.length === 0) {
      console.log(`no baselines in ${store.kind} (${store.describe})`)
      return
    }
    for (const s of stored) {
      console.log(`${s.name.padEnd(24)} ${s.takenAt}  ${s.database}  ${s.objects} objects`)
    }
  } finally {
    await store.close()
  }
}
