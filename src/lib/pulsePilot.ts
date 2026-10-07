import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PULSE_BOOKMAKERS, PULSE_SPORTS } from "./providers/pulsescore";
export type PulsePilot = {
  checkedAt: string;
  readAt: string | null;
  ok: boolean;
  bookmaker: string;
  sport: string;
  attempts: 1;
  events: number | null;
  missingPriceTimestamps: number | null;
};
/** Historical diagnostic, never a claim about credentials changed after this check. */
export function normalizePulsePilot(
  input: unknown,
  now = Date.now(),
): PulsePilot | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const r = input as Record<string, unknown>;
  const checked =
    typeof r.checkedAt === "string" ? Date.parse(r.checkedAt) : NaN;
  if (
    r.provider !== "pulsescore" ||
    r.scope !== "pilot_connection_check" ||
    r.attempts !== 1 ||
    r.paidAuthorized !== true ||
    typeof r.ok !== "boolean" ||
    !Number.isFinite(checked) ||
    checked > now + 60000 ||
    !PULSE_BOOKMAKERS.some((b) => b === r.bookmaker) ||
    !PULSE_SPORTS.some((s) => s === r.sport)
  )
    return null;
  const count = (v: unknown): v is number =>
    typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 30;
  const read = typeof r.readAt === "string" ? Date.parse(r.readAt) : NaN;
  if (
    r.ok &&
    (!count(r.events) ||
      !count(r.missingPriceTimestamps) ||
      r.missingPriceTimestamps > r.events ||
      !Number.isFinite(read) ||
      read < checked ||
      read > now + 60000)
  )
    return null;
  return {
    checkedAt: r.checkedAt as string,
    readAt: r.ok ? (r.readAt as string) : null,
    ok: r.ok,
    bookmaker: r.bookmaker as string,
    sport: r.sport as string,
    attempts: 1,
    events: r.ok ? (r.events as number) : null,
    missingPriceTimestamps: r.ok ? (r.missingPriceTimestamps as number) : null,
  };
}
export async function readPulsePilot(): Promise<PulsePilot | null> {
  try {
    const text = await readFile(
      resolve(process.cwd(), ".local/pulsescore/connection.json"),
      "utf8",
    );
    if (text.length > 16000) return null;
    return normalizePulsePilot(JSON.parse(text));
  } catch {
    return null;
  }
}
