import { describe, expect, test } from "bun:test"
import { countChanges, diffLines, sideBySide, splitLines } from "./textdiff"

describe("diffLines", () => {
  test("equal texts produce no changes", () => {
    const lines = diffLines("a\nb\nc", "a\nb\nc")
    expect(lines.every((l) => l.op === "equal")).toBe(true)
    expect(countChanges(lines)).toEqual({ added: 0, removed: 0 })
  })

  test("an appended line is one addition, not a rewrite", () => {
    const lines = diffLines("a\nb", "a\nb\nc")
    expect(countChanges(lines)).toEqual({ added: 1, removed: 0 })
    expect(lines[2]).toMatchObject({
      op: "add",
      text: "c",
      oldNo: null,
      newNo: 3,
    })
  })

  test("a line inserted in the middle keeps the rest equal", () => {
    const lines = diffLines("a\nc", "a\nb\nc")
    expect(lines.map((l) => l.op)).toEqual(["equal", "add", "equal"])
  })

  test("a changed line is one removal and one addition", () => {
    const lines = diffLines("a\nb\nc", "a\nB\nc")
    expect(countChanges(lines)).toEqual({ added: 1, removed: 1 })
  })

  test("an empty side is all additions", () => {
    expect(countChanges(diffLines("", "a\nb"))).toEqual({
      added: 2,
      removed: 0,
    })
    expect(countChanges(diffLines("a\nb", ""))).toEqual({
      added: 0,
      removed: 2,
    })
  })

  test("line numbers point back at the right side", () => {
    const lines = diffLines("keep\ngone", "keep\nnew")
    const del = lines.find((l) => l.op === "del")!
    const add = lines.find((l) => l.op === "add")!
    expect(del.oldNo).toBe(2)
    expect(del.newNo).toBeNull()
    expect(add.newNo).toBe(2)
    expect(add.oldNo).toBeNull()
  })
})

describe("sideBySide", () => {
  test("pairs a removal with the addition that replaced it", () => {
    const rows = sideBySide(diffLines("a\nold\nz", "a\nnew\nz"))
    expect(rows).toHaveLength(3)
    expect(rows[1]!.left!.text).toBe("old")
    expect(rows[1]!.right!.text).toBe("new")
  })

  test("leaves the short side empty when the runs differ in length", () => {
    const rows = sideBySide(diffLines("a", "a\nb\nc"))
    expect(rows[1]!.left).toBeNull()
    expect(rows[1]!.right!.text).toBe("b")
    expect(rows[2]!.right!.text).toBe("c")
  })
})

describe("splitLines", () => {
  test("empty text is no lines, not one empty line", () => {
    expect(splitLines("")).toEqual([])
  })

  test("a trailing newline does not invent a line", () => {
    expect(splitLines("a\nb\n")).toEqual(["a", "b"])
  })
})
