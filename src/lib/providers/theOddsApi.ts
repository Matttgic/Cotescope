import { THE_ODDS_API_FR_BOOKMAKERS, THE_ODDS_API_REFERENCE_BOOKMAKER } from "@/lib/bookmakers";
import type { Opportunity, Sport } from "@/lib/types";
import { fairOddsFromProbability, noVigProbabilities, opportunityScore, passesHighOddsGuard } from "@/lib/value";

type ApiOutcome = { name: string; price: number; point?: number };
type ApiMarket = { key: string; last_update: string; outcomes: ApiOutcome[] };
type ApiBookmaker = { key: string; title: string; last_update: string; markets: ApiMarket[] };
type ApiEvent = {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: ApiBookmaker[];
};

export type OddsApiResult = {
  opportunities: Opportunity[];
  quota: { remaining: number | null; used: number | null; lastCost: number | null };
};

function numberHeader(headers: Headers, name: string): number | null {
  const raw = headers.get(name);
  if (raw == null) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function sportLabel(key: string): Sport {
  if (key.startsWith("soccer")) return "Football";
  if (key.startsWith("tennis")) return "Tennis";
  if (key.startsWith("basketball")) return "Basketball";
  if (key.startsWith("rugby")) return "Rugby";
  if (key.startsWith("handball")) return "Handball";
  if (key.startsWith("volleyball")) return "Volleyball";
  if (key.startsWith("icehockey")) return "Hockey";
  if (key.startsWith("baseball")) return "Baseball";
  if (key.includes("nfl") || key.startsWith("americanfootball")) return "NFL";
  if (key.startsWith("mma")) return "MMA";
  if (key.startsWith("boxing")) return "Boxe";
  if (key.startsWith("cricket")) return "Cricket";
  if (key.startsWith("darts")) return "Darts";
  if (key.startsWith("table_tennis") || key.startsWith("tabletennis")) return "Tennis de table";
  return "Autre";
}

function freshnessScore(lastUpdate: string): { seconds: number; score: number } {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(lastUpdate).getTime()) / 1000));
  if (seconds <= 30) return { seconds, score: 1 };
  if (seconds <= 90) return { seconds, score: 0.9 };
  if (seconds <= 180) return { seconds, score: 0.75 };
  if (seconds <= 300) return { seconds, score: 0.55 };
  return { seconds, score: 0.35 };
}

export async function fetchFrenchH2HOpportunities(sportKey = "upcoming"): Promise<OddsApiResult> {
  const apiKey = process.env.THE_ODDS_API_KEY;
  if (!apiKey) throw new Error("THE_ODDS_API_KEY is not configured");
  if (!/^[a-z0-9_]+$/.test(sportKey)) throw new Error("Invalid sport key");

  const baseUrl = (process.env.THE_ODDS_API_BASE_URL || "https://api.the-odds-api.com").replace(/\/$/, "");
  const bookmakers = [...Object.keys(THE_ODDS_API_FR_BOOKMAKERS), THE_ODDS_API_REFERENCE_BOOKMAKER].join(",");
  const url = new URL(`${baseUrl}/v4/sports/${encodeURIComponent(sportKey)}/odds/`);
  url.searchParams.set("apiKey", apiKey);
  url.searchParams.set("bookmakers", bookmakers);
  url.searchParams.set("markets", "h2h");
  url.searchParams.set("oddsFormat", "decimal");
  url.searchParams.set("dateFormat", "iso");

  const response = await fetch(url, { cache: "no-store" });
  const quota = {
    remaining: numberHeader(response.headers, "x-requests-remaining"),
    used: numberHeader(response.headers, "x-requests-used"),
    lastCost: numberHeader(response.headers, "x-requests-last")
  };

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Odds provider error ${response.status}: ${body.slice(0, 300)}`);
  }

  const events = (await response.json()) as ApiEvent[];
  const opportunities: Opportunity[] = [];

  for (const event of events) {
    const reference = event.bookmakers.find((b) => b.key === THE_ODDS_API_REFERENCE_BOOKMAKER);
    const refMarket = reference?.markets.find((m) => m.key === "h2h");
    if (!reference || !refMarket || refMarket.outcomes.length < 2) continue;

    const fairProbabilities = noVigProbabilities(refMarket.outcomes.map((o) => o.price));
    const fairBySelection = new Map(refMarket.outcomes.map((outcome, index) => [outcome.name, {
      probability: fairProbabilities[index],
      referenceOdds: outcome.price
    }]));

    for (const bookmaker of event.bookmakers) {
      if (!(bookmaker.key in THE_ODDS_API_FR_BOOKMAKERS)) continue;
      const market = bookmaker.markets.find((m) => m.key === "h2h");
      if (!market) continue;
      const freshness = freshnessScore(bookmaker.last_update || market.last_update);

      for (const outcome of market.outcomes) {
        const fair = fairBySelection.get(outcome.name);
        if (!fair || fair.probability <= 0 || outcome.price <= 1) continue;
        const evPct = (outcome.price * fair.probability - 1) * 100;
        if (evPct <= 0) continue;

        const score = opportunityScore({
          evPct,
          sharpQuality: 0.95,
          freshness: freshness.score,
          stability: 0.7,
          consensus: 0.75,
          liquidity: 0.7
        });
        const fairOdds = fairOddsFromProbability(fair.probability);
        const bookmakerLabel = THE_ODDS_API_FR_BOOKMAKERS[bookmaker.key as keyof typeof THE_ODDS_API_FR_BOOKMAKERS];

        opportunities.push({
          id: `${event.id}:${bookmaker.key}:h2h:${outcome.name}`,
          sport: sportLabel(event.sport_key),
          competition: event.sport_title,
          event: `${event.home_team} – ${event.away_team}`,
          startTime: event.commence_time,
          market: "Résultat / H2H",
          selection: outcome.name,
          bookmaker: bookmakerLabel,
          bookmakerOdds: outcome.price,
          referenceOdds: fair.referenceOdds,
          fairOdds,
          evPct,
          opportunityScore: score,
          freshnessSeconds: freshness.seconds,
          confidence: score >= 85 ? "Forte" : score >= 70 ? "Moyenne" : "Faible",
          highOddsGuard: passesHighOddsGuard(outcome.price, score, evPct),
          isBoost: false
        });
      }
    }
  }

  opportunities.sort((a, b) => b.opportunityScore - a.opportunityScore || b.evPct - a.evPct);
  return { opportunities, quota };
}
