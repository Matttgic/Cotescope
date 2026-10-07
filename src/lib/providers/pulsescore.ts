/** Server/CLI only. A bounded explicit pilot, never an automatic collector. */
export const PULSE_BOOKMAKERS = [
  "winamax",
  "betclic",
  "unibet-fr",
  "pmu",
] as const;
export const PULSE_SPORTS = [
  "soccer",
  "basketball",
  "tennis",
  "ice-hockey",
  "handball",
  "volleyball",
  "rugby-union",
  "american-football",
  "baseball",
] as const;
export type PulsePage = {
  events: Record<string, unknown>[];
  hasNextPage: boolean;
};
export class PulseError extends Error {
  code: string;
  status: number | null;
  retryAfterSeconds: number | null;
  constructor(
    code: string,
    status: number | null = null,
    retryAfterSeconds: number | null = null,
  ) {
    super(code);
    this.name = "PulseError";
    this.code = code;
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
function retryDelay(raw: string | null, now: number) {
  if (!raw) return null;
  const numeric = Number(raw);
  const value = Number.isFinite(numeric)
    ? numeric
    : (Date.parse(raw) - now) / 1000;
  return Number.isFinite(value) && value >= 0 ? Math.ceil(value) : null;
}
/** One page, one HTTP attempt, no retry or pagination. Caller must explicitly authorize it. */
export async function readPulsePage(options: {
  key: string;
  allowPaid: boolean;
  bookmaker?: string;
  sport?: string;
  fetcher?: typeof fetch;
  now?: number;
}): Promise<PulsePage> {
  const bookmaker = options.bookmaker || "winamax",
    sport = options.sport || "soccer";
  if (!options.allowPaid) throw new PulseError("explicit_paid_check_required");
  if (!options.key?.trim()) throw new PulseError("pulsescore_key_missing");
  if (
    !PULSE_BOOKMAKERS.some((b) => b === bookmaker) ||
    !PULSE_SPORTS.some((s) => s === sport)
  )
    throw new PulseError("unsupported_pulse_scope");
  let response: Response;
  try {
    response = await (options.fetcher || fetch)(
      `https://api.pulsescore.net/api/${bookmaker}/${sport}/events?page=1&limit=30`,
      {
        method: "GET",
        headers: { "X-Secret": options.key, Accept: "application/json" },
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(20000),
      },
    );
  } catch {
    throw new PulseError("pulsescore_network_error");
  }
  if (!response.ok) {
    await response.body?.cancel();
    const code =
      response.status === 401 || response.status === 403
        ? "pulsescore_access_denied"
        : response.status === 429
          ? "pulsescore_rate_limited"
          : "pulsescore_http_error";
    throw new PulseError(
      code,
      response.status,
      retryDelay(
        response.headers.get("retry-after"),
        options.now ?? Date.now(),
      ),
    );
  }
  if (!response.body) throw new PulseError("pulsescore_empty_body");
  const reader = response.body.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 8_000_000) throw new PulseError("pulsescore_body_too_large");
      chunks.push(part.value);
    }
  } catch (e) {
    if (e instanceof PulseError) throw e;
    throw new PulseError("pulsescore_network_error");
  } finally {
    await reader.cancel().catch(() => {});
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.length;
  }
  let data: unknown;
  try {
    data = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new PulseError("pulsescore_invalid_json");
  }
  if (
    !data ||
    typeof data !== "object" ||
    !Array.isArray((data as Record<string, unknown>).events)
  )
    throw new PulseError("pulsescore_invalid_schema");
  const page = data as Record<string, unknown>;
  const events = page.events as unknown[];
  if (
    events.length > 30 ||
    events.some((e) => !e || typeof e !== "object" || Array.isArray(e))
  )
    throw new PulseError("pulsescore_invalid_schema");
  return {
    events: events as Record<string, unknown>[],
    hasNextPage: page.hasNextPage === true,
  };
}
export function pulseSummary(page: PulsePage) {
  const markets: Record<string, number> = Object.create(null);
  let suspended = 0,
    live = 0,
    missingPriceTimestamps = 0;
  for (const event of page.events) {
    if (event.live === true) live++;
    if (event.suspended === true) suspended++;
    if (
      ![event.updatedAt, event.lastUpdate, event.lastUpdated].some(
        (v) => typeof v === "string" && Number.isFinite(Date.parse(v)),
      )
    )
      missingPriceTimestamps++;
    for (const market of Array.isArray(event.markets) ? event.markets : []) {
      if (!market || typeof market !== "object") continue;
      const raw = (market as Record<string, unknown>).canonicalMarket;
      const canonical = [
        "MATCH_RESULT",
        "HALF_TIME_RESULT",
        "SET_WINNER",
        "DRAW_NO_BET",
        "DOUBLE_CHANCE",
        "ASIAN_HANDICAP",
        "GAME_HANDICAP",
        "SET_HANDICAP",
        "OVER_UNDER",
        "HOME_OVER_UNDER",
        "AWAY_OVER_UNDER",
        "BOTH_TEAMS_TO_SCORE",
        "CORRECT_SCORE",
        "HALF_TIME_FULL_TIME",
        "EUROPEAN_HANDICAP",
      ];
      const name =
        typeof raw === "string" && canonical.includes(raw) ? raw : "AUTRE";
      markets[name] = (Object.hasOwn(markets, name) ? markets[name] : 0) + 1;
    }
  }
  return {
    events: page.events.length,
    live,
    suspended,
    markets,
    hasNextPage: page.hasNextPage,
    missingPriceTimestamps,
  };
}
