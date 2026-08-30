// A small line differ. DDL blocks are tens of lines, so the quadratic LCS is
// cheaper than a dependency.

export type Op = "equal" | "del" | "add"

export type Line = {
  op: Op
  text: string
  /** 1-based line number in the old text, null for added lines. */
  oldNo: number | null
  /** 1-based line number in the new text, null for removed lines. */
  newNo: number | null
}

/** SideLine is one row of a side-by-side view: left and right may be empty. */
export type SideLine = {
  left: Line | null
  right: Line | null
}

export function splitLines(s: string): string[] {
  if (s === "") return []
  return s.replace(/\n$/, "").split("\n")
}

/** diffLines produces an inline (unified) sequence of operations. */
export function diffLines(before: string, after: string): Line[] {
  const a = splitLines(before)
  const b = splitLines(after)
  const lcs = lcsTable(a, b)

  const out: Line[] = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ op: "equal", text: a[i]!, oldNo: i + 1, newNo: j + 1 })
      i++
      j++
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      out.push({ op: "del", text: a[i]!, oldNo: i + 1, newNo: null })
      i++
    } else {
      out.push({ op: "add", text: b[j]!, oldNo: null, newNo: j + 1 })
      j++
    }
  }
  for (; i < a.length; i++) out.push({ op: "del", text: a[i]!, oldNo: i + 1, newNo: null })
  for (; j < b.length; j++) out.push({ op: "add", text: b[j]!, oldNo: null, newNo: j + 1 })
  return out
}

/** sideBySide pairs each run of removals with the run of additions after it. */
export function sideBySide(lines: Line[]): SideLine[] {
  const out: SideLine[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]!
    if (line.op === "equal") {
      out.push({ left: line, right: line })
      i++
      continue
    }
    const dels: Line[] = []
    const adds: Line[] = []
    while (i < lines.length && lines[i]!.op === "del") dels.push(lines[i++]!)
    while (i < lines.length && lines[i]!.op === "add") adds.push(lines[i++]!)
    const n = Math.max(dels.length, adds.length)
    for (let k = 0; k < n; k++) {
      out.push({ left: dels[k] ?? null, right: adds[k] ?? null })
    }
  }
  return out
}

/** countChanges returns added and removed line counts. */
export function countChanges(lines: Line[]): {
  added: number
  removed: number
} {
  let added = 0
  let removed = 0
  for (const l of lines) {
    if (l.op === "add") added++
    else if (l.op === "del") removed++
  }
  return { added, removed }
}

// lcsTable[i][j] is the LCS length of a[i:] and b[j:].
function lcsTable(a: string[], b: string[]): number[][] {
  const t: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  )
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      t[i]![j] = a[i] === b[j] ? t[i + 1]![j + 1]! + 1 : Math.max(t[i + 1]![j]!, t[i]![j + 1]!)
    }
  }
  return t
}
