# Testing diffium-db

This project uses Bun's built-in test runner. Everything except the capture
tests runs offline.

## Prerequisites

- Bun 1.3+ (`bun --version`)
- For the database tests only: a Postgres url in `DIFFIUM_DB_TEST_URL`

## Quick start

- Run all tests:
  - `bun test`
  - or `make test`

## Useful flags

- Watch mode: `bun test --watch`
- One file: `bun test src/model/diff.test.ts`
- One test: `bun test -t "an edited row"`
- Coverage: `bun test --coverage`
- Types: `bun run check`

## The database tests

`src/pg/capture.test.ts` is skipped unless `DIFFIUM_DB_TEST_URL` is set:

    DIFFIUM_DB_TEST_URL="postgres://…" bun test

Each run creates a schema named `ddb_test_<random>`, works only inside it, and
drops it in `afterAll`. Nothing else in the database is read or written. Any
Postgres 12+ will do; a Neon branch is a cheap way to get a throwaway one.

## The TUI tests

`src/tui/app.test.ts` mounts the real app against OpenTUI's test renderer, which
draws into memory instead of a terminal. Assertions run against
`captureCharFrame()` — the same characters a terminal would receive. No pty, no
snapshots to eyeball, and it runs in CI.

`scripts/shot.ts` uses the same renderer to write `docs/shots/watch.txt` and
`docs/shots/watch.svg`. If a screenshot in the README looks wrong, regenerate it
rather than editing it:

    bun run scripts/shot.ts --schema demo

The `.svg` is the real output; the `.png` in the README is rendered from it by
any headless browser, because GitHub does not render repository SVGs inline:

    chrome --headless --window-size=999,420 \
      --screenshot=docs/shots/watch.png file://$PWD/docs/shots/watch.svg

## Notes

- No test writes to a database it did not create a schema in.
- No test needs the network unless you set `DIFFIUM_DB_TEST_URL`.
