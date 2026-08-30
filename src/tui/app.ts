// The screen. Everything visible is built once and mutated in place: a capture
// tick rebuilds the entries, paint() pushes them into the renderables, and no
// path here talks to a terminal directly — the renderer is handed in, so the
// tests and the screenshots drive the same app the terminal does.

import {
  BoxRenderable,
  RGBA,
  StyledText,
  TextAttributes,
  TextRenderable,
  type CliRenderer,
  type KeyEvent,
} from "@opentui/core"
import type { SQL } from "bun"
import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import type { Config } from "../config"
import { DIR } from "../config"
import { diffSnapshots } from "../model/diff"
import { entriesOf, summarise, type Entry } from "../model/entries"
import { emptySnapshot, type Snapshot } from "../model/snapshot"
import { capture, open } from "../pg/capture"
import type { Store } from "../store/index"
import { savePrefs, type Prefs } from "./prefs"
import type { Theme } from "./theme"
import {
  baselineLines,
  bodyHeight,
  diffLineCount,
  diffPaneLines,
  footerLine,
  headerLine,
  helpLines,
  listLines,
  plain,
  ruleLine,
  type ViewLine,
  type ViewState,
} from "./view"

export type AppDeps = {
  renderer: CliRenderer
  config: Config
  store: Store
  baseline: string
  theme: Theme
  prefs: Prefs
  /**
   * How to take one capture. Defaults to connecting to config.url; a test — or
   * anything else that already has the rows — hands in its own and the app
   * never opens a socket.
   */
  captureNow?: () => Promise<Snapshot>
}

export type App = {
  state: ViewState
  /** refresh captures the database once and rebuilds the change list. */
  refresh(): Promise<void>
  /** rebaseline stores the current state as the new baseline. */
  rebaseline(): Promise<void>
  /** exportDiff writes the selected change to a file and returns its path. */
  exportDiff(): Promise<string>
  onKey(key: KeyEvent): void
  paint(): void
  start(): void
  dispose(): Promise<void>
}

const MIN_LEFT_WIDTH = 18

export async function createApp(deps: AppDeps): Promise<App> {
  const { renderer, config, store, theme, prefs } = deps
  const sql = deps.captureNow ? null : open(config.url)
  const captureNow =
    deps.captureNow ??
    (() =>
      capture(sql as SQL, {
        schemas: config.schemas,
        rowLimit: config.rowLimit,
        rows: config.rows,
      }))

  let baselineSnap = (await store.load(deps.baseline)) ?? emptySnapshot()
  let current: Snapshot | null = null
  let capturing = false
  let timer: ReturnType<typeof setInterval> | null = null
  let quit = false

  const state: ViewState = {
    entries: [],
    selected: 0,
    listOffset: 0,
    diffOffset: 0,
    hOffset: 0,
    sideBySide: prefs.sideBySide,
    wrap: prefs.wrap,
    leftWidth: prefs.leftWidth,
    width: renderer.terminalWidth,
    height: renderer.terminalHeight,
    baseline: deps.baseline,
    store: store.kind === "neon" ? `neon ${store.describe}` : "local",
    database: baselineSnap.database || "…",
    refreshedAt: null,
    status: null,
    overlay: null,
  }

  // --- renderables -------------------------------------------------------

  const root = new BoxRenderable(renderer, {
    width: "100%",
    height: "100%",
    flexDirection: "column",
  })
  const header = new TextRenderable(renderer, { content: "", height: 1 })
  const rule = new TextRenderable(renderer, { content: "", height: 1 })
  const body = new BoxRenderable(renderer, {
    flexGrow: 1,
    flexDirection: "row",
  })
  const leftBox = new BoxRenderable(renderer, {
    width: state.leftWidth,
    flexDirection: "column",
    overflow: "hidden",
  })
  const leftText = new TextRenderable(renderer, { content: "" })
  const dividerText = new TextRenderable(renderer, { content: "", width: 1 })
  const rightBox = new BoxRenderable(renderer, {
    flexGrow: 1,
    flexDirection: "column",
    overflow: "hidden",
  })
  const rightText = new TextRenderable(renderer, { content: "" })
  const footer = new TextRenderable(renderer, { content: "", height: 1 })

  leftBox.add(leftText)
  rightBox.add(rightText)
  body.add(leftBox)
  body.add(dividerText)
  body.add(rightBox)
  root.add(header)
  root.add(rule)
  root.add(body)
  root.add(footer)
  renderer.root.add(root)

  const overlayBox = new BoxRenderable(renderer, {
    position: "absolute",
    left: 4,
    top: 2,
    width: 52,
    height: 18,
    border: true,
    borderStyle: "rounded",
    borderColor: theme.dividerColor,
    backgroundColor: theme.panelColor,
    padding: 1,
    flexDirection: "column",
    overflow: "hidden",
    visible: false,
    zIndex: 10,
  })
  const overlayText = new TextRenderable(renderer, { content: "" })
  overlayBox.add(overlayText)
  renderer.root.add(overlayBox)

  // --- painting ----------------------------------------------------------

  function paint(): void {
    // A capture in flight when the renderer goes away still runs its finally,
    // and painting a destroyed text buffer throws. Quitting wins.
    if (quit) return
    state.width = renderer.terminalWidth
    state.height = renderer.terminalHeight
    state.leftWidth = clamp(
      state.leftWidth,
      MIN_LEFT_WIDTH,
      Math.max(MIN_LEFT_WIDTH, state.width - 20),
    )
    leftBox.width = state.leftWidth

    header.content = styled([headerLine(state, theme)])
    rule.content = styled([ruleLine(state, theme)])
    leftText.content = styled(listLines(state, theme))
    dividerText.content = styled(
      Array.from({ length: bodyHeight(state.height) }, () => [
        { text: "│", color: theme.dividerColor },
      ]),
    )
    rightText.content = styled(diffPaneLines(state, theme))
    footer.content = styled([footerLine(state, theme)])

    const panel =
      state.overlay === "help"
        ? helpLines(theme)
        : state.overlay === "baseline"
          ? baselineLines(state, theme)
          : null
    if (!panel) {
      overlayBox.visible = false
      return
    }
    showOverlay(panel)
  }

  // An overlay is centred, sized to what it has to say, and never taller than
  // the terminal — a help panel that runs off the bottom is worse than no help.
  function showOverlay(panel: ViewLine[]): void {
    const inner = Math.max(...panel.map((l) => l.reduce((n, c) => n + c.text.length, 0)), 20)
    const width = Math.min(state.width - 4, inner + 4)
    const height = Math.min(state.height - 2, panel.length + 4)
    overlayBox.width = width
    overlayBox.height = height
    overlayBox.left = Math.max(0, Math.floor((state.width - width) / 2))
    overlayBox.top = Math.max(0, Math.floor((state.height - height) / 2))
    overlayBox.visible = true
    const fits = height - 4
    const shown = panel.length > fits ? [...panel.slice(0, fits - 1), [{ text: "…" }]] : panel
    overlayText.content = styled(shown.map((line) => padLine(line, width - 4, theme.panelColor)))
  }

  // Each line is padded to the panel width so the background is a solid block
  // rather than the screen underneath showing between the words.
  function padLine(line: ViewLine, width: number, bg: string): ViewLine {
    const used = line.reduce((n, c) => n + c.text.length, 0)
    const out = line.map((c) => ({ ...c, bg: c.bg ?? bg }))
    if (used < width) out.push({ text: " ".repeat(width - used), bg })
    return out
  }

  function styled(lines: ViewLine[]): StyledText {
    const chunks: object[] = []
    lines.forEach((line, i) => {
      if (i > 0) chunks.push({ __isChunk: true, text: "\n", attributes: 0 })
      for (const cell of line) {
        chunks.push({
          __isChunk: true,
          text: cell.text,
          fg: cell.color ? RGBA.fromHex(cell.color) : undefined,
          bg: cell.bg ? RGBA.fromHex(cell.bg) : undefined,
          attributes: cell.bold ? TextAttributes.BOLD : 0,
        })
      }
    })
    return new StyledText(chunks as never)
  }

  // --- capture -----------------------------------------------------------

  async function refresh(): Promise<void> {
    if (capturing || quit) return
    capturing = true
    try {
      current = await captureNow()
      state.database = current.database
      state.entries = entriesOf(diffSnapshots(baselineSnap, current))
      state.refreshedAt = new Date()
      state.status = null
      clampCursors()
    } catch (err) {
      state.status = `error: ${(err as Error).message}`
    } finally {
      capturing = false
      paint()
    }
  }

  async function rebaseline(): Promise<void> {
    const snap = current ?? (await captureNow())
    await store.save(deps.baseline, snap)
    baselineSnap = snap
    state.entries = []
    state.selected = 0
    state.listOffset = 0
    state.diffOffset = 0
    state.status = `baseline "${deps.baseline}" is now ${snap.takenAt.slice(11, 19)}`
    paint()
  }

  async function exportDiff(): Promise<string> {
    const dir = join(config.root, DIR)
    await mkdir(dir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)
    const path = join(dir, `diff-${stamp}.txt`)
    await writeFile(path, exportText(state.entries, state.database, deps.baseline), "utf8")
    return path
  }

  // --- keys --------------------------------------------------------------

  function onKey(key: KeyEvent): void {
    const name = key.name ?? ""
    const ch = key.sequence ?? ""

    if (state.overlay === "baseline") {
      if (ch === "y") void rebaseline().catch(fail)
      if (ch === "y" || ch === "n" || name === "escape") state.overlay = null
      paint()
      return
    }
    if (state.overlay === "help") {
      if (ch === "h" || name === "escape" || ch === "q") state.overlay = null
      paint()
      return
    }

    switch (true) {
      case ch === "q" || (key.ctrl && ch === "c"):
        void dispose().then(() => renderer.destroy())
        return
      case ch === "j" || name === "down":
        move(1)
        break
      case ch === "k" || name === "up":
        move(-1)
        break
      case ch === "J" || name === "pagedown":
        scrollDiff(bodyHeight(state.height) - 1)
        break
      case ch === "K" || name === "pageup":
        scrollDiff(-(bodyHeight(state.height) - 1))
        break
      case ch === "}":
        state.hOffset += 8
        break
      case ch === "{":
        state.hOffset = Math.max(0, state.hOffset - 8)
        break
      case ch === ">" || ch === "L":
        setLeftWidth(state.leftWidth + 2)
        break
      case ch === "<" || ch === "H":
        setLeftWidth(state.leftWidth - 2)
        break
      case ch === "s":
        state.sideBySide = !state.sideBySide
        state.diffOffset = 0
        persist()
        break
      case ch === "w":
        state.wrap = !state.wrap
        state.hOffset = 0
        persist()
        break
      case ch === "g":
        select(0)
        break
      case ch === "G":
        select(state.entries.length - 1)
        break
      case ch === "r":
        void refresh().catch(fail)
        return
      case ch === "b":
        state.overlay = "baseline"
        break
      case ch === "e":
        void exportDiff()
          .then((path) => {
            state.status = `wrote ${path}`
            paint()
          })
          .catch(fail)
        return
      case ch === "h":
        state.overlay = "help"
        break
      default:
        return
    }
    paint()
  }

  function move(delta: number): void {
    select(state.selected + delta)
  }

  function select(index: number): void {
    if (state.entries.length === 0) return
    state.selected = clamp(index, 0, state.entries.length - 1)
    state.diffOffset = 0
    state.hOffset = 0
    clampCursors()
  }

  function scrollDiff(delta: number): void {
    const max = Math.max(0, diffLineCount(state, theme) - bodyHeight(state.height))
    state.diffOffset = clamp(state.diffOffset + delta, 0, max)
  }

  function setLeftWidth(width: number): void {
    state.leftWidth = clamp(width, MIN_LEFT_WIDTH, Math.max(MIN_LEFT_WIDTH, state.width - 20))
    persist()
  }

  function persist(): void {
    savePrefs(config.root, {
      wrap: state.wrap,
      sideBySide: state.sideBySide,
      leftWidth: state.leftWidth,
    })
  }

  function clampCursors(): void {
    const height = bodyHeight(state.height)
    state.selected = clamp(state.selected, 0, Math.max(0, state.entries.length - 1))
    if (state.selected < state.listOffset) state.listOffset = state.selected
    if (state.selected >= state.listOffset + height) state.listOffset = state.selected - height + 1
    state.listOffset = clamp(state.listOffset, 0, Math.max(0, state.entries.length - height))
  }

  function fail(err: unknown): void {
    state.status = `error: ${(err as Error).message}`
    paint()
  }

  function start(): void {
    renderer.keyInput.on("keypress", onKey)
    void refresh().catch(fail)
    timer = setInterval(() => void refresh().catch(fail), config.interval)
  }

  async function dispose(): Promise<void> {
    if (quit) return
    quit = true
    if (timer) clearInterval(timer)
    renderer.keyInput.off("keypress", onKey)
    await sql?.end()
    await store.close()
  }

  paint()
  return {
    state,
    refresh,
    rebaseline,
    exportDiff,
    onKey,
    paint,
    start,
    dispose,
  }
}

/** exportText is the plain-text rendering of a whole change list. */
export function exportText(entries: Entry[], database: string, baseline: string): string {
  const out = [
    `diffium-db  ${database}`,
    `baseline    ${baseline}`,
    `captured    ${new Date().toISOString()}`,
    `summary     ${summarise(entries)}`,
    "",
  ]
  for (const e of entries) {
    out.push(`${e.mark} ${e.title}  ${e.stat}`)
    for (const l of e.lines) {
      out.push(`${l.op === "add" ? "+" : l.op === "del" ? "-" : " "} ${l.text}`)
    }
    out.push("")
  }
  return out.join("\n")
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

export { plain }
