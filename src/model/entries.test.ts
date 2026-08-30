import { describe, expect, test } from "bun:test"
import { diffSnapshots } from "./diff"
import { entriesOf, summarise } from "./entries"
import { rows, snapshot, table } from "./fixtures"

const cols = ["id", "email"]

describe("entriesOf", () => {
  test("structure comes before rows", () => {
    const before = snapshot(
      [table("public.users", cols)],
      [rows("public.users", cols, [["1", "ada"]])],
    )
    const after = snapshot(
      [table("public.users", [...cols, "plan"])],
      [
        rows("public.users", cols, [
          ["1", "ada"],
          ["2", "grace"],
        ]),
      ],
    )
    const entries = entriesOf(diffSnapshots(before, after))
    expect(entries.map((e) => e.source)).toEqual(["structure", "rows"])
    expect(entries[0]!.title).toBe("table public.users")
    expect(entries[1]!.title).toBe("rows public.users")
  })

  test("marks say what happened", () => {
    const before = snapshot([table("public.users", cols)])
    const after = snapshot([table("public.orgs", ["id"])])
    const marks = entriesOf(diffSnapshots(before, after)).map((e) => e.mark)
    expect(marks.sort()).toEqual(["+", "-"])
  })

  test("stats count lines for structure and rows for data", () => {
    const before = snapshot([table("public.users", cols)])
    const after = snapshot([table("public.users", [...cols, "plan"])])
    expect(entriesOf(diffSnapshots(before, after))[0]!.stat).toBe("+1 -0")
  })

  test("a row stat flags a shape change instead of claiming edits", () => {
    const grown = [...cols, "plan"]
    const before = snapshot(
      [table("public.users", cols)],
      [rows("public.users", cols, [["1", "ada"]])],
    )
    const after = snapshot(
      [table("public.users", grown)],
      [rows("public.users", grown, [["1", "ada", "free"]])],
    )
    const rowEntry = entriesOf(diffSnapshots(before, after)).find((e) => e.source === "rows")!
    expect(rowEntry.stat).toContain("?")
  })
})

describe("summarise", () => {
  test("says nothing happened when nothing did", () => {
    expect(summarise([])).toBe("no changes")
  })

  test("counts both halves", () => {
    const before = snapshot(
      [table("public.users", cols)],
      [rows("public.users", cols, [["1", "ada"]])],
    )
    const after = snapshot(
      [table("public.users", cols), table("public.orgs", ["id"])],
      [
        rows("public.users", cols, [
          ["1", "ada"],
          ["2", "grace"],
        ]),
      ],
    )
    expect(summarise(entriesOf(diffSnapshots(before, after)))).toBe(
      "2 changes: 1 structure, 1 rows",
    )
  })
})
