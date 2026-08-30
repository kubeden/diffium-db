// Command dispatch. node:util's parseArgs does the work — one dependency fewer
// than a flag library, and the flags are the same on every subcommand.

import { parseArgs } from "node:util"
import type { Flags } from "../config"

const USAGE = `diffium-db — watch what changes in your database

Usage:
  diffium-db watch                Open the TUI and watch for changes
  diffium-db snapshot             Capture the database as a baseline
  diffium-db diff                 Print the changes since the baseline
  diffium-db baselines            List stored baselines

Flags:
  -u, --url <url>        Database to watch (or DATABASE_URL)
  -n, --name <name>      Baseline name (default: baseline)
      --schema <name>    Schema to watch, repeatable (default: all non-system)
      --store <kind>     Where baselines live: local or neon (default: local)
      --store-url <url>  Connection url when --store neon
      --interval <ms>    How often watch re-captures (default: 1000)
      --row-limit <n>    Tables past this many rows are counted only (default: 5000)
      --no-rows          Watch structure only
      --root <path>      Project directory holding .diffium-db (default: cwd)
      --json             Machine-readable output where it applies
      --exit-code        Exit 1 from diff when anything changed
  -h, --help             This
`

export async function execute(argv: string[]): Promise<void> {
  const command = argv[0] && !argv[0].startsWith("-") ? argv[0] : ""
  const rest = command ? argv.slice(1) : argv

  const { values } = parseArgs({
    args: rest,
    options: {
      url: { type: "string", short: "u" },
      name: { type: "string", short: "n" },
      schema: { type: "string", multiple: true },
      store: { type: "string" },
      "store-url": { type: "string" },
      interval: { type: "string" },
      "row-limit": { type: "string" },
      "no-rows": { type: "boolean" },
      root: { type: "string" },
      json: { type: "boolean" },
      "exit-code": { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: false,
  })

  if (values.help || command === "" || command === "help") {
    process.stdout.write(USAGE)
    return
  }

  const flags: Flags = {
    url: values.url,
    schema: values.schema,
    store: values.store,
    storeUrl: values["store-url"],
    interval: values.interval ? Number(values.interval) : undefined,
    rowLimit: values["row-limit"] ? Number(values["row-limit"]) : undefined,
    rows: values["no-rows"] ? false : undefined,
    root: values.root,
  }
  const name = values.name ?? "baseline"

  switch (command) {
    case "watch": {
      const { runWatch } = await import("./watch")
      return runWatch(flags, name)
    }
    case "snapshot": {
      const { runSnapshot } = await import("./snapshot")
      return runSnapshot(flags, name, Boolean(values.json))
    }
    case "diff": {
      const { runDiff } = await import("./diff")
      return runDiff(flags, name, Boolean(values.json), Boolean(values["exit-code"]))
    }
    case "baselines": {
      const { runBaselines } = await import("./baselines")
      return runBaselines(flags, Boolean(values.json))
    }
    default:
      throw new Error(`unknown command: ${command}\n\n${USAGE}`)
  }
}
