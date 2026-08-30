// Snapshots to test against, small enough to read in full.

import { SNAPSHOT_VERSION, type DbObject, type Snapshot, type TableRows } from "./snapshot"

export function table(key: string, columns: string[]): DbObject {
  const [schema, name] = key.split(".") as [string, string]
  return {
    key,
    kind: "table",
    schema,
    name,
    ddl: [`table ${key}`, ...columns.map((c) => `  column ${c}`)].join("\n"),
  }
}

export function rows(key: string, columns: string[], values: string[][]): TableRows {
  return {
    key,
    count: values.length,
    columns,
    digests: values.map((v) => ({
      pk: v[0]!,
      hash: v.join("|"),
      preview: `(${v.join(",")})`,
    })),
    countOnly: false,
  }
}

export function snapshot(objects: DbObject[], tables: TableRows[] = []): Snapshot {
  return {
    version: SNAPSHOT_VERSION,
    takenAt: "2026-08-30T09:00:00.000Z",
    database: "demo",
    schemas: ["public"],
    objects,
    rows: tables,
  }
}
