export type DataSource = "cotescope" | "cotes-value" | "demo" | "live";

/** Public mode only; no key, database or paid collector is activated here. */
export function defaultDataSource(value?: string): DataSource {
  if (value === "demo") return "demo";
  if (value === "live" || value === "theoddsapi") return "live";
  if (value === "cotes-value") return "cotes-value";
  return "cotescope";
}
