// Colours, read from .diffium-db/theme.json in the project you are watching —
// the same repo-local theming diffium uses. Hex only; omitted fields keep the
// default.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { DIR } from "../config"

export type Theme = {
  addColor: string
  delColor: string
  metaColor: string
  dividerColor: string
  selectedColor: string
  textColor: string
  panelColor: string
}

export function defaultTheme(): Theme {
  return {
    addColor: "#22c55e",
    delColor: "#ef4444",
    metaColor: "#8b9bb4",
    dividerColor: "#3f4753",
    selectedColor: "#7dd3fc",
    textColor: "#d8dee9",
    panelColor: "#161b22",
  }
}

/** loadTheme merges .diffium-db/theme.json over the defaults. */
export function loadTheme(root: string): Theme {
  const theme = defaultTheme()
  let raw: string
  try {
    raw = readFileSync(join(root, DIR, "theme.json"), "utf8")
  } catch {
    return theme
  }
  let parsed: Partial<Theme>
  try {
    parsed = JSON.parse(raw) as Partial<Theme>
  } catch {
    return theme
  }
  for (const key of Object.keys(theme) as (keyof Theme)[]) {
    const v = parsed[key]
    if (typeof v === "string" && v !== "") theme[key] = v
  }
  return theme
}
