import { createCliRenderer } from "@opentui/core"
import { loadConfig, type Flags } from "../config"
import { openStore } from "../store/index"
import { createApp } from "../tui/app"
import { loadPrefs } from "../tui/prefs"
import { loadTheme } from "../tui/theme"

export async function runWatch(flags: Flags, baseline: string): Promise<void> {
  const config = await loadConfig(flags)
  const store = await openStore(config.store)
  const renderer = await createCliRenderer({ exitOnCtrlC: true })

  const app = await createApp({
    renderer,
    config,
    store,
    baseline,
    theme: loadTheme(config.root),
    prefs: loadPrefs(config.root),
  })

  renderer.once("destroy", () => void app.dispose())
  app.start()
}
