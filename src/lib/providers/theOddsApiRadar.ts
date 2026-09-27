import "server-only";

import { createHash } from "crypto";

type ApiSport = {
  key: string;
  group: string;
  title: string;
  description?: string;
  active: boolean;
  has_outrights?: boolean;
};

export type RadarEvent = {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
};

export type RadarSportWindow = {
  key: string;
  title: string;
  group: string;
  eventCount: number;
  eventHash: string;
  firstStart: string;
  lastStart: string;
};

export type RadarWindowResult = {
  from: string;
  to: string;
  sportsChecked: number;
  sportStates: RadarSportWindow[];
  activeSports: RadarSportWindow[];
  quota: { remaining: number | null; used: number | null; lastCost: number | null };
  errors: string[];
  fullInventory: boolean;
};

function numberHeader(headers: Headers, name: string): number | null {
  const raw = headers.get(name);
  if (raw == null) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function providerBaseUrl() {
  return (process.env.THE_ODDS_API_BASE_URL || "https://api.the-odds-api.com").replace(/\/$/, "");
}

function providerKey() {
  const apiKey = process.env.THE_ODDS_API_KEY;
  if (!apiKey) throw new Error("THE_ODDS_API_KEY is not configured");
  return apiKey;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchActiveSports() {
  const url = new URL(`${providerBaseUrl()}/v4/sports/`);
  url.searchParams.set("apiKey", providerKey());

  const response = await fetch(url, { cache: "no-store" });
  const quota = {
    remaining: numberHeader(response.headers, "x-requests-remaining"),
    used: numberHeader(response.headers, "x-requests-used"),
    lastCost: numberHeader(response.headers, "x-requests-last"),
  };

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Sports radar error ${response.status}: ${body.slice(0, 300)}`);
  }

  const raw = (await response.json()) as ApiSport[];
  const sports = Array.isArray(raw)
    ? raw.filter((sport) => sport.active && /^[a-z0-9_]+$/.test(sport.key))
    : [];

  return { sports, quota };
}

async function fetchSportEvents(sportKey: string, from: string, to: string): Promise<RadarEvent[]> {
  const url = new URL(`${providerBaseUrl()}/v4/sports/${encodeURIComponent(sportKey)}/events`);
  url.searchParams.set("apiKey", providerKey());
  url.searchParams.set("dateFormat", "iso");
  url.searchParams.set("commenceTimeFrom", from);
  url.searchParams.set("commenceTimeTo", to);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(url, { cache: "no-store" });
    if (response.ok) {
      const raw = (await response.json()) as RadarEvent[];
      return Array.isArray(raw) ? raw : [];
    }
    if (response.status === 404 || response.status === 422) return [];
    if (response.status === 429 && attempt < 2) {
      await sleep(1_500 * (attempt + 1));
      continue;
    }
    const body = await response.text();
    throw new Error(`Events radar error ${response.status}: ${body.slice(0, 220)}`);
  }

  return [];
}

function eventHash(events: RadarEvent[]) {
  const normalized = events
    .map((event) => `${event.id}:${event.commence_time}`)
    .sort()
    .join("|");
  return createHash("sha1").update(normalized).digest("hex").slice(0, 20);
}

export async function fetchRadarWindow(
  windowMinutes = 90,
  cachedSportKeys?: string[],
): Promise<RadarWindowResult> {
  const now = Date.now();
  const from = new Date(now + 5 * 60_000).toISOString();
  const to = new Date(now + Math.max(15, windowMinutes) * 60_000).toISOString();
  const fullInventory = !cachedSportKeys;

  let sports: Array<Pick<ApiSport, "key" | "title" | "group">> = [];
  let quota = { remaining: null, used: null, lastCost: null } as RadarWindowResult["quota"];

  if (fullInventory) {
    const inventory = await fetchActiveSports();
    sports = inventory.sports;
    quota = inventory.quota;
  } else {
    sports = [...new Set(cachedSportKeys)]
      .filter((key) => /^[a-z0-9_]+$/.test(key))
      .map((key) => ({ key, title: key, group: "Cached active sports" }));
  }

  const sportStates: RadarSportWindow[] = [];
  const errors: string[] = [];
  const concurrency = 4;

  for (let index = 0; index < sports.length; index += concurrency) {
    const batch = sports.slice(index, index + concurrency);
    const results = await Promise.allSettled(
      batch.map(async (sport) => ({ sport, events: await fetchSportEvents(sport.key, from, to) })),
    );

    for (const result of results) {
      if (result.status === "rejected") {
        errors.push(result.reason instanceof Error ? result.reason.message : "radar_event_error");
        continue;
      }

      const { sport, events } = result.value;
      const ordered = [...events].sort((a, b) => Date.parse(a.commence_time) - Date.parse(b.commence_time));
      const title = ordered[0]?.sport_title || sport.title;
      sportStates.push({
        key: sport.key,
        title,
        group: sport.group,
        eventCount: ordered.length,
        eventHash: eventHash(ordered),
        firstStart: ordered[0]?.commence_time ?? "",
        lastStart: ordered[ordered.length - 1]?.commence_time ?? "",
      });
    }

    if (index + concurrency < sports.length) await sleep(500);
  }

  const activeSports = sportStates
    .filter((sport) => sport.eventCount > 0)
    .sort((a, b) => Date.parse(a.firstStart) - Date.parse(b.firstStart));

  return {
    from,
    to,
    sportsChecked: sports.length,
    sportStates,
    activeSports,
    quota,
    errors,
    fullInventory,
  };
}
