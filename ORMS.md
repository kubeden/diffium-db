# ORM plugins

Not built yet. This file is the shape they will take, so the seam in
`src/orms/index.ts` is a promise rather than a placeholder.

## What is missing without them

v1 tells you a column called `plan` appeared on `users`. It does not tell you
that `prisma/migrations/20260830_add_plans/migration.sql` put it there, or that
your Drizzle schema still says otherwise. That gap — from what the database looks
like to what in your repository caused it — is the whole job of an adapter.

## The interface

    export type OrmAdapter = {
      name: string
      detect(root: string): Promise<boolean>
      attribute(root: string, change: ObjectChange): Promise<Attribution[]>
      attributeRows?(root: string, change: RowChange): Promise<Attribution[]>
    }

`detect` decides whether the project uses the ORM at all — a `prisma/` directory,
a `drizzle.config.ts`, a `manage.py`. `attribute` takes one structural change and
returns the files it can blame for it, with a line number where it can find one.
`attributeRows` is optional and covers seeds and backfills, which live in files
too.

`adapters` is the registry. An adapter registers itself there; nothing else
changes.

## Where it shows up

The TUI's left pane has room for one more line under a change, and the diff pane
has a header. An attributed change reads:

    ~ table public.users                +2 -0
      prisma/migrations/20260830_add_plans/migration.sql:4

That is the whole feature. Not a new screen, not a new command — the same list,
with the cause attached.

## Order they are worth doing

1. **Prisma** — migrations are plain SQL in dated directories, so attribution is
   close to a grep, and `prisma migrate diff` gives a second opinion for free.
2. **Drizzle** — the schema is TypeScript and the journal in `drizzle/meta/` maps
   migrations to snapshots, which is very nearly this tool's own model.
3. **Django** — migrations are Python operations, so attribution means reading
   the operation list rather than SQL.
4. **Rails / ActiveRecord** — `schema.rb` is already a canonical rendering of the
   structure, and comparing it against what diffium-db captured catches the case
   where the file and the database have quietly diverged.

## The rule an adapter must not break

An adapter reads the project directory. It does not run migrations, does not
connect to the database, and does not write anything. If attribution is
uncertain, it returns nothing — a wrong file name costs more than a missing one.
