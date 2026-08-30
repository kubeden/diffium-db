// Diffing two snapshots. Structure changes come out as text diffs of the
// canonical DDL; row changes come out as inserted/updated/deleted digests.

import {
  objectByKey,
  rowsByKey,
  type DbObject,
  type ObjectKind,
  type RowDigest,
  type Snapshot,
} from "./snapshot"
import { countChanges, diffLines, type Line } from "./textdiff"

export type ChangeStatus = "added" | "removed" | "changed"

/** ObjectChange is one structural difference between two snapshots. */
export type ObjectChange = {
  key: string
  kind: ObjectKind
  status: ChangeStatus
  before: string
  after: string
  lines: Line[]
  added: number
  removed: number
}

/** RowChange is the row-level difference for one table. */
export type RowChange = {
  key: string
  countBefore: number
  countAfter: number
  inserted: RowDigest[]
  deleted: RowDigest[]
  updated: { before: RowDigest; after: RowDigest }[]
  /** true when one side was count-only, so the row lists are not authoritative. */
  countOnly: boolean
  /**
   * true when the table gained or lost columns between the two snapshots. A row
   * is fingerprinted over its whole record, so every row of a table that grew a
   * column reads as updated. Inserts and deletes are still exact — they come
   * from the primary key — but "updated" cannot be trusted, and the diff says so
   * instead of quietly claiming edits nobody made.
   */
  shapeChanged: boolean
  /** columns added and removed, when shapeChanged. */
  columnsAdded: string[]
  columnsRemoved: string[]
}

export type Diff = {
  objects: ObjectChange[]
  rows: RowChange[]
}

export function diffSnapshots(before: Snapshot, after: Snapshot): Diff {
  return { objects: diffObjects(before, after), rows: diffRows(before, after) }
}

/** isEmpty reports whether the two snapshots agree about everything. */
export function isEmpty(d: Diff): boolean {
  return d.objects.length === 0 && d.rows.length === 0
}

function diffObjects(before: Snapshot, after: Snapshot): ObjectChange[] {
  const old = objectByKey(before)
  const now = objectByKey(after)
  const keys = [...new Set([...old.keys(), ...now.keys()])].sort()

  const out: ObjectChange[] = []
  for (const key of keys) {
    const a = old.get(key)
    const b = now.get(key)
    if (a && b && a.ddl === b.ddl) continue
    const status: ChangeStatus = !a ? "added" : !b ? "removed" : "changed"
    const lines = diffLines(a?.ddl ?? "", b?.ddl ?? "")
    const { added, removed } = countChanges(lines)
    out.push({
      key,
      kind: (b ?? (a as DbObject)).kind,
      status,
      before: a?.ddl ?? "",
      after: b?.ddl ?? "",
      lines,
      added,
      removed,
    })
  }
  return out
}

function diffRows(before: Snapshot, after: Snapshot): RowChange[] {
  const old = rowsByKey(before)
  const now = rowsByKey(after)
  const keys = [...new Set([...old.keys(), ...now.keys()])].sort()

  const out: RowChange[] = []
  for (const key of keys) {
    const a = old.get(key)
    const b = now.get(key)
    // A table that only exists on one side is already reported as a structure
    // change; its rows are noise on top of that.
    if (!a || !b) continue

    const countOnly = a.countOnly || b.countOnly
    // Snapshots written before columns were captured have none; treat that as
    // "shape unknown" rather than "shape changed".
    const oldCols = a.columns ?? []
    const newCols = b.columns ?? []
    const known = oldCols.length > 0 && newCols.length > 0
    const columnsAdded = known ? newCols.filter((c) => !oldCols.includes(c)) : []
    const columnsRemoved = known ? oldCols.filter((c) => !newCols.includes(c)) : []
    const change: RowChange = {
      key,
      countBefore: a.count,
      countAfter: b.count,
      inserted: [],
      deleted: [],
      updated: [],
      countOnly,
      shapeChanged: columnsAdded.length > 0 || columnsRemoved.length > 0,
      columnsAdded,
      columnsRemoved,
    }

    if (!countOnly) {
      const oldByPk = new Map(a.digests.map((d) => [d.pk, d]))
      const newByPk = new Map(b.digests.map((d) => [d.pk, d]))
      for (const [pk, d] of newByPk) {
        const prev = oldByPk.get(pk)
        if (!prev) change.inserted.push(d)
        else if (prev.hash !== d.hash) change.updated.push({ before: prev, after: d })
      }
      for (const [pk, d] of oldByPk) {
        if (!newByPk.has(pk)) change.deleted.push(d)
      }
    }

    const touched =
      change.inserted.length > 0 ||
      change.deleted.length > 0 ||
      change.updated.length > 0 ||
      change.countBefore !== change.countAfter
    if (touched) out.push(change)
  }
  return out
}

/** rowDiffText renders a row change the way the diff pane shows it. */
export function rowDiffText(c: RowChange): { before: string; after: string } {
  if (c.countOnly) {
    return {
      before: `rows: ${c.countBefore}`,
      after: `rows: ${c.countAfter}\n(table too large to fingerprint; counts only)`,
    }
  }
  const before: string[] = []
  const after: string[] = []
  if (c.shapeChanged) {
    const parts: string[] = []
    if (c.columnsAdded.length) parts.push(`+${c.columnsAdded.join(", +")}`)
    if (c.columnsRemoved.length) parts.push(`-${c.columnsRemoved.join(", -")}`)
    const note = `# columns changed (${parts.join(" ")}) — every row reads as edited; inserts and deletes are still exact`
    before.push(note)
    after.push(note)
  }
  for (const d of c.deleted) before.push(d.preview)
  for (const u of c.updated) {
    before.push(u.before.preview)
    after.push(u.after.preview)
  }
  for (const d of c.inserted) after.push(d.preview)
  return { before: before.join("\n"), after: after.join("\n") }
}
