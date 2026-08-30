# Design

Short and concrete, written before the code. If the code disagrees with this
file, one of the two is wrong and it is worth finding out which.

## The problem

An agent changes your database and you find out later. `git diff` covers the
migration file; it does not cover what the migration did, and it covers nothing
at all about the row an agent updated because it seemed reasonable. Schema-diff
tools compare two databases after the fact. Nothing sits open next to you while
the work happens.

So: a watcher. Point it at a database, take a baseline, and leave it running.
Anything that changes shows up.

## Shape

Deliberately the same shape as diffium. Changed things on the left, the change
itself on the right, a top bar naming what you are looking at, a bottom bar with
the clock and the help hint. Same keys where the same keys make sense — `j/k`,
`s`, `w`, `g/G`, `r`, `h`, `q`, `<`/`>`. Someone who uses diffium should not have
to learn a second program.

diffium is Go and Bubble Tea. This is TypeScript, because OpenTUI is TypeScript.
So the style copy is conventions rather than language idiom: `cmd`-thin entry and
everything else under a package directory, small files, doc comments that start
with the name of the thing, tests beside the code, minimal dependencies, the
same README sections, the same repo furniture.

## Pipeline

    capture -> snapshot -> diff -> entries -> view -> screen

Each arrow is a module boundary and each stage is a plain value:

- **capture** (`src/pg/`) reads Postgres. Two halves: structure from the
  catalogs, rows by fingerprint.
- **snapshot** (`src/model/snapshot.ts`) is what capture returns and what a
  store keeps. JSON, no behaviour.
- **diff** (`src/model/diff.ts`) compares two snapshots.
- **entries** (`src/model/entries.ts`) flattens the diff into one list. The TUI's
  left pane and the `diff` command walk the same list, so what you read on screen
  and what you read in a pipe cannot drift apart.
- **view** (`src/tui/view.ts`) turns state into coloured lines. It touches no
  terminal, so the whole screen can be asserted on without one.
- **screen** (`src/tui/app.ts`) is the only file that knows OpenTUI exists.

## Three decisions worth writing down

**Structure is text.** Every object — table, view, enum, function — renders to
one canonical block with a deterministic line order. The structural diff is then
a line diff of those blocks. That is what gives side-by-side, `+2 -0` counts and
horizontal scrolling for free, and it means adding a column is one added line
rather than a table that "changed". The cost is that diffium-db reports *what*
the database looks like now, not the DDL statement that would get you there. For
a watcher, the first is what you want; a migration generator would want the
second.

**A row is its primary key and a hash.** `md5(t::text)` per row, keyed by the
primary key, plus a 300-character preview. Cheap to compute in the database,
cheap to store, and it tells an insert from an update from a delete exactly. The
cost is the shape problem: hashing the whole record means a table that gained a
column reads as entirely edited. Rather than hide it, the diff detects the column
change, marks the table, and says that updates cannot be trusted there while
inserts and deletes still can. Tables without a primary key and tables over
`--row-limit` get a count and no claims.

**The baseline is a stored value, not a live connection.** You can baseline now,
walk away, and diff against it tomorrow; you can keep several named baselines;
you can commit one next to the migration that produced it. Two stores implement
the same six methods — a directory of JSON files, and a table in Postgres. Neon
is the backend the second was built against, but nothing in it is Neon-specific.

## v1 scope, and what is out

In: the four commands, both stores, structure and rows, the TUI, theming,
preferences, export.

Out, on purpose:

- **ORM plugins.** v2. `src/orms/` has the interface and an empty registry so
  the seam is visible. See `ORMS.md`.
- **Databases other than Postgres.** The `src/pg/` boundary is where a second
  dialect would go; nothing above it knows what a catalog is.
- **Sequences.** Every `bigserial` makes one, and they change on every insert.
  Noise, until someone wants them.
- **Streaming.** v1 polls once a second and re-reads. Logical replication would
  be cheaper on a large database and is the obvious next thing if polling starts
  to hurt.
- **Anything that writes to the database being watched.** diffium-db reads. The
  only thing it writes is its own store, and only when you point it at one.
