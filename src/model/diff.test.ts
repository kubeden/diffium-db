import { describe, expect, test } from "bun:test"
import { diffSnapshots, isEmpty, rowDiffText } from "./diff"
import { rows, snapshot, table } from "./fixtures"

const cols = ["id", "email"]

describe("structure", () => {
  test("identical snapshots are empty", () => {
    const a = snapshot([table("public.users", cols)])
    expect(isEmpty(diffSnapshots(a, a))).toBe(true)
  })

  test("a new table is one addition", () => {
    const before = snapshot([table("public.users", cols)])
    const after = snapshot([table("public.users", cols), table("public.orgs", ["id"])])
    const d = diffSnapshots(before, after)
    expect(d.objects).toHaveLength(1)
    expect(d.objects[0]).toMatchObject({ key: "public.orgs", status: "added" })
  })

  test("a dropped table is one removal", () => {
    const before = snapshot([table("public.users", cols), table("public.orgs", ["id"])])
    const after = snapshot([table("public.users", cols)])
    expect(diffSnapshots(before, after).objects[0]).toMatchObject({
      key: "public.orgs",
      status: "removed",
    })
  })

  test("a new column is one added line, not a rewritten table", () => {
    const before = snapshot([table("public.users", cols)])
    const after = snapshot([table("public.users", [...cols, "plan"])])
    const change = diffSnapshots(before, after).objects[0]!
    expect(change.status).toBe("changed")
    expect(change.added).toBe(1)
    expect(change.removed).toBe(0)
  })
})

describe("rows", () => {
  const before = snapshot(
    [table("public.users", cols)],
    [
      rows("public.users", cols, [
        ["1", "ada"],
        ["2", "grace"],
      ]),
    ],
  )

  test("an inserted row shows up as inserted", () => {
    const after = snapshot(
      [table("public.users", cols)],
      [
        rows("public.users", cols, [
          ["1", "ada"],
          ["2", "grace"],
          ["3", "alan"],
        ]),
      ],
    )
    const change = diffSnapshots(before, after).rows[0]!
    expect(change.inserted.map((r) => r.pk)).toEqual(["3"])
    expect(change.updated).toHaveLength(0)
    expect(change.deleted).toHaveLength(0)
  })

  test("a deleted row shows up as deleted", () => {
    const after = snapshot(
      [table("public.users", cols)],
      [rows("public.users", cols, [["1", "ada"]])],
    )
    const change = diffSnapshots(before, after).rows[0]!
    expect(change.deleted.map((r) => r.pk)).toEqual(["2"])
  })

  test("an edited row shows up as updated, keyed by its primary key", () => {
    const after = snapshot(
      [table("public.users", cols)],
      [
        rows("public.users", cols, [
          ["1", "ada"],
          ["2", "grace hopper"],
        ]),
      ],
    )
    const change = diffSnapshots(before, after).rows[0]!
    expect(change.updated).toHaveLength(1)
    expect(change.updated[0]!.before.pk).toBe("2")
    expect(change.shapeChanged).toBe(false)
  })

  test("a table that only exists on one side reports no row change", () => {
    const after = snapshot([], [])
    expect(diffSnapshots(before, after).rows).toHaveLength(0)
  })

  test("nothing to say when the rows match", () => {
    expect(diffSnapshots(before, before).rows).toHaveLength(0)
  })

  test("a new column marks the row change as a shape change", () => {
    const grown = [...cols, "plan"]
    const after = snapshot(
      [table("public.users", grown)],
      [
        rows("public.users", grown, [
          ["1", "ada", "free"],
          ["2", "grace", "pro"],
        ]),
      ],
    )
    const change = diffSnapshots(before, after).rows[0]!
    expect(change.shapeChanged).toBe(true)
    expect(change.columnsAdded).toEqual(["plan"])
    expect(change.updated).toHaveLength(2)
    expect(rowDiffText(change).before).toContain("columns changed")
  })

  test("count-only tables report counts and claim nothing else", () => {
    const big = {
      ...rows("public.big", cols, []),
      count: 900_000,
      countOnly: true,
    }
    const a = snapshot([table("public.big", cols)], [big])
    const b = snapshot([table("public.big", cols)], [{ ...big, count: 900_001 }])
    const change = diffSnapshots(a, b).rows[0]!
    expect(change.countOnly).toBe(true)
    expect(change.inserted).toHaveLength(0)
    expect(rowDiffText(change).after).toContain("counts only")
  })
})
