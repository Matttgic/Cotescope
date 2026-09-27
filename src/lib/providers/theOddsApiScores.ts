import "server-only";

type ScoreEntry = {
  name: string;
  score: string;
};

export type CompletedScoreEvent = {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  completed: boolean;
  home_team: string;
  away_team: string;
  scores: ScoreEntry[] | null;
  last_update?: string;
};

export type ScoresApiResult = {
  events: CompletedScoreEvent[];
  quota: { remaining: number | null; used: number | null; lastCost: number | null };
  unsupported: boolean;
};

function numberHeader(headers: Headers, name: string): number | null {
  const raw = headers.get(name);
  if (raw == null) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

export async function fetchRecentScores(sportKey: string): Promise<ScoresApiResult> {
  const apiKey = process.env.THE_ODDS_API_KEY;
  if (!apiKey) throw new Error("THE_ODDS_API_KEY is not configured");
  if (!/^[a-z0-9_]+$/.test(sportKey)) throw new Error("Invalid sport key");

  const baseUrl = (process.env.THE_ODDS_API_BASE_URL || "https://api.the-odds-api.com").replace(/\/$/, "");
  const url = new URL(`${baseUrl}/v4/sports/${encodeURIComponent(sportKey)}/scores/`);
  url.searchParams.set("apiKey", apiKey);
  url.searchParams.set("daysFrom", "1");
  url.searchParams.set("dateFormat", "iso");

  const response = await fetch(url, { cache: "no-store" });
  const quota = {
    remaining: numberHeader(response.headers, "x-requests-remaining"),
    used: numberHeader(response.headers, "x-requests-used"),
    lastCost: numberHeader(response.headers, "x-requests-last"),
  };

  if (!response.ok) {
    if (response.status === 404 || response.status === 422) {
      return { events: [], quota, unsupported: true };
    }
    const body = await response.text();
    throw new Error(`Scores provider error ${response.status}: ${body.slice(0, 300)}`);
  }

  const events = (await response.json()) as CompletedScoreEvent[];
  return { events: Array.isArray(events) ? events : [], quota, unsupported: false };
}
