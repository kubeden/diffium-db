// Screenshots of the real TUI, taken without a terminal. OpenTUI's test
// renderer draws into memory, so the app you see here is the app you run —
// same state, same widths, same colours.
//
//   bun run scripts/shot.ts --schema demo
//
// Writes docs/shots/watch.txt (plain) and docs/shots/watch.svg (coloured).

import { createTestRenderer } from "@opentui/core/testing"
import { mkdir, writeFile } from "node:fs/promises"
import { parseArgs } from "node:util"
import { loadConfig } from "../src/config"
import { openStore } from "../src/store/index"
import { createApp } from "../src/tui/app"
import { defaultPrefs } from "../src/tui/prefs"
import { defaultTheme } from "../src/tui/theme"

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    schema: { type: "string", multiple: true },
    name: { type: "string" },
    root: { type: "string" },
    out: { type: "string" },
    width: { type: "string" },
    height: { type: "string" },
    select: { type: "string" },
  },
})

const width = Number(values.width ?? 104)
const height = Number(values.height ?? 26)
const config = await loadConfig({ schema: values.schema, root: values.root })
const store = await openStore(config.store)
const setup = await createTestRenderer({ width, height })

const app = await createApp({
  renderer: setup.renderer,
  config,
  store,
  baseline: values.name ?? "baseline",
  theme: defaultTheme(),
  prefs: { ...defaultPrefs(), leftWidth: 32 },
})

await app.refresh()
for (let i = 0; i < Number(values.select ?? 0); i++)
  app.onKey({ name: "j", sequence: "j" } as never)
app.paint()
await setup.renderOnce()

const out = values.out ?? "docs/shots/watch"
await mkdir(out.slice(0, out.lastIndexOf("/")), { recursive: true })
await writeFile(`${out}.txt`, setup.captureCharFrame() + "\n", "utf8")
await writeFile(`${out}.svg`, toSvg(setup.captureSpans()), "utf8")
console.log(setup.captureCharFrame())
console.log(`\nwrote ${out}.txt and ${out}.svg`)

await app.dispose()
setup.renderer.destroy()

type Span = {
  text: string
  width: number
  fg?: { buffer: Record<string, number> }
  bg?: { buffer: Record<string, number> }
  attributes: number
}
type Frame = { cols: number; rows: number; lines: { spans: Span[] }[] }

// A terminal is a grid, so the svg is a grid: one rect per coloured run, one
// text element per run, monospace metrics fixed by the cell size.
function toSvg(frame: Frame): string {
  const cw = 8.4
  const ch = 18
  const pad = 12
  const w = Math.ceil(frame.cols * cw + pad * 2)
  const h = Math.ceil(frame.rows * ch + pad * 2)
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="14">`,
    `<rect width="${w}" height="${h}" rx="8" fill="#0d1117"/>`,
  ]
  frame.lines.forEach((line, row) => {
    let col = 0
    for (const span of line.spans) {
      const x = pad + col * cw
      const y = pad + row * ch
      const bg = hex(span.bg)
      if (bg && bg !== "#000000") {
        parts.push(
          `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(span.width * cw).toFixed(1)}" height="${ch}" fill="${bg}"/>`,
        )
      }
      const text = span.text.replace(/\s+$/, "")
      if (text) {
        const weight = span.attributes & 1 ? ' font-weight="700"' : ""
        parts.push(
          `<text x="${x.toFixed(1)}" y="${(y + ch - 5).toFixed(1)}" fill="${hex(span.fg) ?? "#d8dee9"}"${weight} xml:space="preserve">${escape(text)}</text>`,
        )
      }
      col += span.width
    }
  })
  parts.push("</svg>")
  return parts.join("\n")
}

function hex(c: Span["fg"]): string | null {
  if (!c) return null
  const b = c.buffer
  const to = (n: number) => Math.round(n).toString(16).padStart(2, "0")
  return `#${to(b["0"] ?? 0)}${to(b["1"] ?? 0)}${to(b["2"] ?? 0)}`
}

function escape(s: string): string {
  return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
}
