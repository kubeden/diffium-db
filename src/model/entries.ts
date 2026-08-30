// One flat list of what changed. The TUI's left pane and the `diff` command
// walk the same entries, so what you read in a terminal and what you read in a
// pipe cannot drift apart.

import { rowDiffText, type Diff, type ObjectChange, type RowChange } from "./diff"
import { diffLines, type Line } from "./textdiff"

export type EntrySource = "structure" | "rows"

export type Entry = {
  id: string
  source: EntrySource
  /** "+", "-" or "~" — added, removed, changed. */
  mark: string
  /** "public.users" or "rows public.users". */
  title: string
  /** right-hand summary: "+2 -0" or "+1 ~1 -0". */
  stat: string
  before: string
  after: string
  lines: Line[]
}

export function entriesOf(diff: Diff): Entry[] {
  const out: Entry[] = []
  for (const c of diff.objects) out.push(objectEntry(c))
  for (const c of diff.rows) out.push(rowEntry(c))
  return out
}

function objectEntry(c: ObjectChange): Entry {
  return {
    id: `structure:${c.key}`,
    source: "structure",
    mark: c.status === "added" ? "+" : c.status === "removed" ? "-" : "~",
    title: `${c.kind} ${c.key}`,
    stat: `+${c.added} -${c.removed}`,
    before: c.before,
    after: c.after,
    lines: c.lines,
  }
}

function rowEntry(c: RowChange): Entry {
  const { before, after } = rowDiffText(c)
  const mark = c.countAfter > c.countBefore ? "+" : c.countAfter < c.countBefore ? "-" : "~"
  const stat = c.countOnly
    ? `${c.countBefore} -> ${c.countAfter}`
    : `+${c.inserted.length} ~${c.updated.length}${c.shapeChanged ? "?" : ""} -${c.deleted.length}`
  return {
    id: `rows:${c.key}`,
    source: "rows",
    mark,
    title: `rows ${c.key}`,
    stat,
    before,
    after,
    lines: diffLines(before, after),
  }
}

/** summarise is the one-line headline: "3 changes: 2 structure, 1 rows". */
export function summarise(entries: Entry[]): string {
  if (entries.length === 0) return "no changes"
  const structure = entries.filter((e) => e.source === "structure").length
  const rows = entries.length - structure
  const parts: string[] = []
  if (structure) parts.push(`${structure} structure`)
  if (rows) parts.push(`${rows} rows`)
  return `${entries.length} change${entries.length === 1 ? "" : "s"}: ${parts.join(", ")}`
}
