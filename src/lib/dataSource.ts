export type DataSource = "cotes-value" | "demo" | "live";

/** Public mode only; no key, database or paid collector is activated here. */
export function defaultDataSource(value?: string): DataSource {
  if (value === "demo") return "demo";
  if (value === "live" || value === "theoddsapi") return "live";
  return "cotes-value";
}
