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
  activeSports: RadarSportWindow[];
  quota: { remaining: number | null; used: number | null; lastCost: number | null };
  errors: string[];
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

  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    if (response.status === 404 || response.status === 422) return [];
    const body = await response.text();
    throw new Error(`Events radar error ${response.status}: ${body.slice(0, 220)}`);
  }

  const raw = (await response.json()) as RadarEvent[];
  return Array.isArray(raw) ? raw : [];
}

function eventHash(events: RadarEvent[]) {
  const normalized = events
    .map((event) => `${event.id}:${event.commence_time}`)
    .sort()
    .join("|");
  return createHash("sha1").update(normalized).digest("hex").slice(0, 20);
}

export async function fetchRadarWindow(windowMinutes = 90): Promise<RadarWindowResult> {
  const now = Date.now();
  const from = new Date(now + 5 * 60_000).toISOString();
  const to = new Date(now + Math.max(15, windowMinutes) * 60_000).toISOString();
  const { sports, quota } = await fetchActiveSports();
  const activeSports: RadarSportWindow[] = [];
  const errors: string[] = [];

  const concurrency = 8;
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
      if (events.length === 0) continue;
      const ordered = [...events].sort((a, b) => Date.parse(a.commence_time) - Date.parse(b.commence_time));
      activeSports.push({
        key: sport.key,
        title: sport.title,
        group: sport.group,
        eventCount: ordered.length,
        eventHash: eventHash(ordered),
        firstStart: ordered[0].commence_time,
        lastStart: ordered[ordered.length - 1].commence_time,
      });
    }
  }

  activeSports.sort((a, b) => Date.parse(a.firstStart) - Date.parse(b.firstStart));
  return { from, to, sportsChecked: sports.length, activeSports, quota, errors };
}
