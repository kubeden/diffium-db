// Turning state into lines. Nothing here touches a terminal, so the whole
// screen can be rendered — and asserted on — without one.

import type { Entry } from "../model/entries"
import { sideBySide as pairUp, splitLines, type Line } from "../model/textdiff"
import type { Theme } from "./theme"

/** Cell is a run of text with one colour. A line is a list of them. */
export type Cell = {
  text: string
  color?: string
  bg?: string
  bold?: boolean
}
export type ViewLine = Cell[]

export type Overlay = "help" | "baseline" | null

export type ViewState = {
  entries: Entry[]
  selected: number
  listOffset: number
  diffOffset: number
  hOffset: number
  sideBySide: boolean
  wrap: boolean
  leftWidth: number
  width: number
  height: number
  baseline: string
  store: string
  database: string
  refreshedAt: Date | null
  status: string | null
  overlay: Overlay
}

/** bodyHeight is the number of rows the two panes get, after the bars. */
export function bodyHeight(height: number): number {
  return Math.max(1, height - 3)
}

export function headerLine(s: ViewState, theme: Theme): ViewLine {
  const entry = s.entries[s.selected]
  const title = entry ? entry.title : s.entries.length === 0 ? "no changes" : ""
  return [
    { text: "Changes", color: theme.textColor, bold: true },
    { text: " | ", color: theme.dividerColor },
    { text: title, color: theme.metaColor },
  ]
}

export function ruleLine(s: ViewState, theme: Theme): ViewLine {
  return [{ text: "─".repeat(Math.max(0, s.width)), color: theme.dividerColor }]
}

export function footerLine(s: ViewState, theme: Theme): ViewLine {
  const left = s.status ?? "h: help"
  const right = [
    `${s.database}`,
    `baseline ${s.baseline} · ${s.store}`,
    s.refreshedAt ? `refreshed ${clock(s.refreshedAt)}` : "capturing…",
  ].join("  ")
  const gap = Math.max(1, s.width - left.length - right.length)
  return [
    { text: left, color: s.status ? theme.addColor : theme.metaColor },
    { text: " ".repeat(gap) },
    { text: right, color: theme.metaColor },
  ]
}

/** listLines renders the left pane: one row per change. */
export function listLines(s: ViewState, theme: Theme): ViewLine[] {
  const height = bodyHeight(s.height)
  const width = s.leftWidth
  if (s.entries.length === 0) {
    return [[{ text: fit("  nothing has changed", width), color: theme.metaColor }]]
  }

  const out: ViewLine[] = []
  for (let i = s.listOffset; i < Math.min(s.entries.length, s.listOffset + height); i++) {
    const e = s.entries[i]!
    const selected = i === s.selected
    const bg = selected ? theme.dividerColor : undefined
    const mark = e.mark === "+" ? theme.addColor : e.mark === "-" ? theme.delColor : theme.metaColor
    const room = Math.max(0, width - 2 - e.stat.length - 1)
    const title = fit(e.title, room)
    out.push([
      { text: `${e.mark} `, color: mark, bg, bold: selected },
      {
        text: title,
        color: selected ? theme.selectedColor : theme.textColor,
        bg,
        bold: selected,
      },
      { text: " ", bg },
      { text: e.stat, color: theme.metaColor, bg },
    ])
  }
  return out
}

/** diffPaneLines renders the right pane for the selected entry. */
export function diffPaneLines(s: ViewState, theme: Theme): ViewLine[] {
  const entry = s.entries[s.selected]
  const width = Math.max(1, s.width - s.leftWidth - 1)
  const height = bodyHeight(s.height)
  if (!entry) {
    return [
      [
        {
          text: fit("  select a change on the left", width),
          color: theme.metaColor,
        },
      ],
    ]
  }
  const all = s.sideBySide ? sideBySideLines(entry, width, theme) : inlineLines(entry, width, theme)
  const shown = s.wrap ? all : all.map((l) => slice(l, s.hOffset, width))
  return shown.slice(s.diffOffset, s.diffOffset + height)
}

/** diffLineCount is how many rendered lines the selected entry has. */
export function diffLineCount(s: ViewState, theme: Theme): number {
  const entry = s.entries[s.selected]
  if (!entry) return 0
  const width = Math.max(1, s.width - s.leftWidth - 1)
  return s.sideBySide
    ? sideBySideLines(entry, width, theme).length
    : inlineLines(entry, width, theme).length
}

function inlineLines(entry: Entry, width: number, theme: Theme): ViewLine[] {
  return entry.lines.map((l) => [
    { text: sign(l), color: colorFor(l, theme) },
    { text: l.text, color: colorFor(l, theme) },
  ])
}

function sideBySideLines(entry: Entry, width: number, theme: Theme): ViewLine[] {
  const half = Math.max(4, Math.floor((width - 3) / 2) - 2)
  return pairUp(entry.lines).map((row) => [
    { text: mark(row.left, "-"), color: theme.delColor },
    {
      text: pad(row.left?.text ?? "", half),
      color: sideColor(row.left, theme, "del"),
    },
    { text: " │ ", color: theme.dividerColor },
    { text: mark(row.right, "+"), color: theme.addColor },
    {
      text: pad(row.right?.text ?? "", half),
      color: sideColor(row.right, theme, "add"),
    },
  ])
}

// The colours carry the change on screen; the sign carries it in an export and
// in a terminal nobody configured for colour.
function mark(l: Line | null, sign: string): string {
  return l && l.op !== "equal" ? `${sign} ` : "  "
}

export function helpLines(theme: Theme): ViewLine[] {
  const keys: [string, string][] = [
    ["j / k", "move selection"],
    ["J / K", "scroll the diff"],
    ["{ / }", "scroll the diff sideways"],
    ["< / >", "resize the left pane"],
    ["s", "side-by-side / inline"],
    ["w", "wrap long lines"],
    ["g / G", "first / last change"],
    ["r", "capture now"],
    ["b", "re-baseline from the current state"],
    ["e", "export this diff to a file"],
    ["h", "close this panel"],
    ["q", "quit"],
  ]
  const out: ViewLine[] = [[{ text: "keys", color: theme.selectedColor, bold: true }], []]
  for (const [key, what] of keys) {
    out.push([
      { text: key.padEnd(8), color: theme.addColor },
      { text: what, color: theme.textColor },
    ])
  }
  return out
}

export function baselineLines(s: ViewState, theme: Theme): ViewLine[] {
  return [
    [{ text: "re-baseline", color: theme.selectedColor, bold: true }],
    [],
    [
      {
        text: `capture ${s.database} now and store it as "${s.baseline}"?`,
        color: theme.textColor,
      },
    ],
    [{ text: "every change on the left goes away.", color: theme.metaColor }],
    [],
    [
      { text: "y", color: theme.addColor },
      { text: " yes    ", color: theme.textColor },
      { text: "n / esc", color: theme.delColor },
      { text: " no", color: theme.textColor },
    ],
  ]
}

function sign(l: Line): string {
  return l.op === "add" ? "+ " : l.op === "del" ? "- " : "  "
}

function colorFor(l: Line, theme: Theme): string {
  return l.op === "add" ? theme.addColor : l.op === "del" ? theme.delColor : theme.textColor
}

function sideColor(l: Line | null, theme: Theme, side: "add" | "del"): string {
  if (!l) return theme.textColor
  if (l.op === "equal") return theme.textColor
  return side === "add" ? theme.addColor : theme.delColor
}

/** fit clips or pads a string to exactly n columns. */
export function fit(s: string, n: number): string {
  return s.length > n ? s.slice(0, Math.max(0, n - 1)) + "…" : s.padEnd(n)
}

function pad(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) : s.padEnd(n)
}

/** slice takes a horizontal window out of an already-rendered line. */
function slice(line: ViewLine, offset: number, width: number): ViewLine {
  const out: ViewLine = []
  let seen = 0
  let taken = 0
  for (const cell of line) {
    const start = Math.max(0, offset - seen)
    const text = cell.text.slice(start, start + (width - taken))
    seen += cell.text.length
    if (text.length === 0) continue
    out.push({ ...cell, text })
    taken += text.length
    if (taken >= width) break
  }
  return out
}

function clock(d: Date): string {
  return d.toTimeString().slice(0, 8)
}

/** plain renders a view line back to text, for exports and tests. */
export function plain(lines: ViewLine[]): string {
  return lines
    .map((l) =>
      l
        .map((c) => c.text)
        .join("")
        .trimEnd(),
    )
    .join("\n")
}

export { splitLines }
