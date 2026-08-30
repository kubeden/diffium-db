// The ORM seam. v1 detects that a column appeared; it cannot tell you which
// migration or model file put it there. That mapping is what an adapter is for,
// and it is v2 — the registry below is deliberately empty so the shape is
// visible and nothing pretends to work yet. See ORMS.md.

import type { ObjectChange, RowChange } from "../model/diff"

/** Attribution is one source location blamed for a change. */
export type Attribution = {
  /** path relative to the project root. */
  file: string
  line?: number
  /** short human sentence: "added by migrations/0004_add_plan.sql". */
  note: string
}

export type OrmAdapter = {
  /** name is what the TUI shows: "prisma", "drizzle", "django". */
  name: string
  /** detect reports whether this project uses the ORM. */
  detect(root: string): Promise<boolean>
  /** attribute blames a structural change on the files that caused it. */
  attribute(root: string, change: ObjectChange): Promise<Attribution[]>
  /** attributeRows is optional: seeds and backfills live in files too. */
  attributeRows?(root: string, change: RowChange): Promise<Attribution[]>
}

/** adapters is the registry. Empty in v1 — plugins land in v2. */
export const adapters: OrmAdapter[] = []

/** detectAdapters returns the adapters that recognise this project. */
export async function detectAdapters(root: string): Promise<OrmAdapter[]> {
  const found: OrmAdapter[] = []
  for (const a of adapters) {
    if (await a.detect(root)) found.push(a)
  }
  return found
}

/** attribute asks every detected adapter to blame one change. */
export async function attribute(
  root: string,
  adapters: OrmAdapter[],
  change: ObjectChange,
): Promise<Attribution[]> {
  const out: Attribution[] = []
  for (const a of adapters) out.push(...(await a.attribute(root, change)))
  return out
}
