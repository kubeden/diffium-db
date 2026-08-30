// Bun's SQL client sends a JS array as a comma-joined string, which Postgres
// rejects as a malformed array literal. Every query that takes a list of names
// passes it through here instead, as an explicit `text[]` literal.

/** textArray renders a Postgres text[] literal: ["a", "b"] -> {"a","b"} */
export function textArray(values: string[]): string {
  const parts = values.map((v) => `"${v.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`)
  return `{${parts.join(",")}}`
}
