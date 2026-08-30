import { describe, expect, test } from "bun:test"
import { diffSnapshots } from "../model/diff"
import { entriesOf } from "../model/entries"
import { rows, snapshot, table } from "../model/fixtures"
import { defaultTheme } from "./theme"
import {
  bodyHeight,
  diffPaneLines,
  fit,
  footerLine,
  headerLine,
  listLines,
  plain,
  type ViewState,
} from "./view"

const theme = defaultTheme()
const cols = ["id", "email"]

const entries = entriesOf(
  diffSnapshots(
    snapshot([table("public.users", cols)], [rows("public.users", cols, [["1", "ada"]])]),
    snapshot(
      [table("public.users", [...cols, "plan"])],
      [
        rows(
          "public.users",
          [...cols, "plan"],
          [
            ["1", "ada", "free"],
            ["2", "grace", "pro"],
          ],
        ),
      ],
    ),
  ),
)

function state(over: Partial<ViewState> = {}): ViewState {
  return {
    entries,
    selected: 0,
    listOffset: 0,
    diffOffset: 0,
    hOffset: 0,
    sideBySide: true,
    wrap: false,
    leftWidth: 30,
    width: 100,
    height: 20,
    baseline: "baseline",
    store: "local",
    database: "demo",
    refreshedAt: new Date("2026-08-30T09:00:00Z"),
    status: null,
    overlay: null,
    ...over,
  }
}

describe("header", () => {
  test("names the selected change", () => {
    expect(plain([headerLine(state(), theme)])).toBe("Changes | table public.users")
  })

  test("says so when nothing changed", () => {
    expect(plain([headerLine(state({ entries: [] }), theme)])).toBe("Changes | no changes")
  })
})

describe("list", () => {
  test("one row per change, marked and counted", () => {
    const drawn = plain(listLines(state(), theme))
    expect(drawn.split("\n")).toHaveLength(2)
    expect(drawn).toContain("~ table public.users")
    expect(drawn).toContain("+1 -0")
  })

  test("shows only what fits and starts from the offset", () => {
    const drawn = listLines(state({ height: 4, listOffset: 1 }), theme)
    expect(drawn).toHaveLength(1)
    expect(plain(drawn)).toContain("rows public.users")
  })

  test("long titles are clipped, never wrapped", () => {
    const [line] = listLines(state({ leftWidth: 20 }), theme)
    const width = line!.reduce((n, c) => n + c.text.length, 0)
    expect(width).toBe(20)
  })
})

describe("diff pane", () => {
  test("side by side puts additions on the right", () => {
    const drawn = plain(diffPaneLines(state(), theme))
    const added = drawn.split("\n").find((l) => l.includes("column plan"))!
    expect(added.indexOf("│")).toBeLessThan(added.indexOf("column plan"))
  })

  test("inline marks each changed line", () => {
    const drawn = plain(diffPaneLines(state({ sideBySide: false }), theme))
    expect(drawn).toContain("+   column plan")
  })

  test("horizontal scroll takes a window, it does not re-wrap", () => {
    const wide = plain(diffPaneLines(state({ sideBySide: false }), theme))
    const scrolled = plain(diffPaneLines(state({ sideBySide: false, hOffset: 8 }), theme))
    expect(scrolled).not.toBe(wide)
    expect(scrolled.split("\n")).toHaveLength(wide.split("\n").length)
  })

  test("nothing selected is a prompt, not an empty pane", () => {
    expect(plain(diffPaneLines(state({ entries: [] }), theme))).toContain("select a change")
  })
})

describe("footer", () => {
  test("carries the baseline, the store and the clock", () => {
    const drawn = plain([footerLine(state(), theme)])
    expect(drawn).toContain("h: help")
    expect(drawn).toContain("baseline baseline · local")
    expect(drawn).toContain("refreshed")
  })

  test("a status replaces the help hint", () => {
    expect(plain([footerLine(state({ status: "wrote diff.txt" }), theme)])).toContain(
      "wrote diff.txt",
    )
  })
})

describe("geometry", () => {
  test("the bars take three rows", () => {
    expect(bodyHeight(20)).toBe(17)
  })

  test("a tiny terminal still gets a row", () => {
    expect(bodyHeight(1)).toBe(1)
  })

  test("fit pads short text and marks clipped text", () => {
    expect(fit("ab", 5)).toBe("ab   ")
    expect(fit("abcdef", 4)).toBe("abc…")
  })
})
