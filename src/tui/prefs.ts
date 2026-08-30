// Persisted view preferences, the way diffium keeps them per repo: small,
// local, and never fatal if the file is missing or broken.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { DIR } from "../config"

export type Prefs = {
  wrap: boolean
  sideBySide: boolean
  leftWidth: number
}

export function defaultPrefs(): Prefs {
  return { wrap: false, sideBySide: true, leftWidth: 34 }
}

export function loadPrefs(root: string): Prefs {
  const prefs = defaultPrefs()
  try {
    const parsed = JSON.parse(readFileSync(pathFor(root), "utf8")) as Partial<Prefs>
    if (typeof parsed.wrap === "boolean") prefs.wrap = parsed.wrap
    if (typeof parsed.sideBySide === "boolean") prefs.sideBySide = parsed.sideBySide
    if (typeof parsed.leftWidth === "number" && parsed.leftWidth > 0) {
      prefs.leftWidth = parsed.leftWidth
    }
  } catch {
    // no prefs yet, or unreadable: the defaults are fine.
  }
  return prefs
}

export function savePrefs(root: string, prefs: Prefs): void {
  try {
    const path = pathFor(root)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, JSON.stringify(prefs, null, 2) + "\n", "utf8")
  } catch {
    // preferences are a convenience; failing to keep them is not an error.
  }
}

function pathFor(root: string): string {
  return join(root, DIR, "prefs.json")
}
