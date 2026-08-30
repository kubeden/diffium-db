# Contributing to diffium-db

Thanks for your interest in contributing! This document outlines how to propose
a change and our working conventions.

## Getting Started

- Requires Bun 1.3+ and a Postgres to point at.
- Install: `bun install`
- Check: `bun run check` (types) and `make test`
- Run: `bun run src/index.ts watch`

## Issues and Assignment

- Before starting work, please open an issue describing the problem or feature.
- Assign yourself to the issue. Our CI enforces that PRs have an assignee and
  that linked issues are assigned.
- Reference the issue in your PR description or title (e.g. `#123`). Closing
  keywords like `Closes #123` are optional. CI will fail if no linked issue is
  found.
- Request at least one reviewer on your PR (CI enforces this).

## Branching and PRs

- Create a branch from `main` (e.g. `feat/prisma-adapter`, `fix/row-limit`).
- Add tests for your change when applicable.
- Keep PRs focused and small; include a clear summary.
- Fill in the PR template checklist and ensure CI passes.

## Code Style

- Keep dependencies minimal and prefer what Bun already gives you.
- Match the existing project structure and naming.
- Favor small, testable units of code.
- A comment explains why, not what. If it restates the line under it, delete it.

## Tests

- Unit tests live beside the code they cover, as `*.test.ts`.
- Everything except `src/pg/capture.test.ts` runs offline with no database.
- Database tests are opt-in: set `DIFFIUM_DB_TEST_URL`. They work inside a
  schema of their own and drop it again.
- The TUI is tested headless through OpenTUI's test renderer, so a screen change
  is an assertion, not a screenshot someone has to look at.

## Theming and UX

- Theme values are read from `.diffium-db/theme.json` per project.
- Keys match diffium's where the same key makes sense. Someone who uses one
  should not have to learn the other.

## Conduct

Please be respectful and inclusive. See `CODE_OF_CONDUCT.md`.
