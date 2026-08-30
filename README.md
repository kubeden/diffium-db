# diffium-db

![the watcher catching a migration](docs/shots/watch.png)

diffium-db is a TUI that shows you what is changing in your database — structure
and rows — while an agent, a migration, or anyone else works. It is the database
half of [diffium](https://github.com/kubeden/diffium): same idea, same shape, one
pane of what changed and one pane of the change itself.

You point it at a database, take a baseline, and leave it open. Everything that
happens after that shows up on the left as it happens.

## Dependencies

bun: >= 1.3.0
a postgres to watch

    brew install oven-sh/bun/bun

## Run

    bun install
    export DATABASE_URL=postgres://…

    bun run src/index.ts snapshot     # take a baseline
    bun run src/index.ts watch        # open the TUI

- `-u, --url` to point at another database, or set `DATABASE_URL`
- `--schema <name>` to watch one schema, repeatable; the default is every
  non-system schema in the database
- `--root <path>` to put `.diffium-db/` somewhere other than the current
  directory

## Keys

- `j/k` or arrow keys: move selection
- `J/K`, `PgDn/PgUp`: scroll the diff
- `{/}`: horizontal scroll in the diff pane
- `s`: toggle side-by-side vs inline
- `w`: toggle line wrap in the diff pane
- `<`/`>` or `H`/`L`: adjust left pane width
- `g/G`: first/last change
- `r`: capture now (auto-capture runs every second)
- `b`: re-baseline from the current state, after a confirmation
- `e`: write the current diff to `.diffium-db/diff-<time>.txt`
- `h`: help panel
- `q`: quit

The top bar shows `Changes | <object>` with a horizontal rule below. The bottom
bar shows `h: help` on the left and the database, the baseline and the last
capture time on the right.

## Quick Demo

`examples/demo/` sets up a `demo` schema and
then changes it the way an agent would.

    psql "$DATABASE_URL" -f examples/demo/01-baseline.sql
    bun run src/index.ts snapshot --schema demo
    bun run src/index.ts watch --schema demo

Then, in the other terminal:

    psql "$DATABASE_URL" -f examples/demo/02-agent-change.sql

Press `j`/`k` to explore the changes, `s` to switch the diff style.

> `h` for help

## Commands

    diffium-db watch        Open the TUI and watch for changes
    diffium-db snapshot     Capture the database as a baseline
    diffium-db diff         Print the changes since the baseline and exit
    diffium-db baselines    List stored baselines

`diff --exit-code` returns 1 when anything changed, which is enough to fail a CI
job or stop an agent's loop. `diff --json` gives you the same thing structured.

## Theming

Repo-local theming via `.diffium-db/theme.json`, relative to `--root`:

    {
      "addColor": "#22c55e",
      "delColor": "#ef4444",
      "dividerColor": "#3f4753"
    }

Hex only. Omitted fields keep their defaults. `selectedColor`, `metaColor`,
`textColor` and `panelColor` are the rest.

`.diffium-db/prefs.json` remembers the pane width and the diff style between
runs.

## Built with

[OpenTUI](https://github.com/anomalyco/opentui) for the terminal, Bun's built-in
SQL client for Postgres. That is the whole dependency list.
