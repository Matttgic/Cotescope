import { getDbPool } from "@/lib/db";
import { demoOpportunities } from "@/data/demo";
import { evidenceScore, passesHighOddsGuard } from "@/lib/value";
import type { Opportunity, Sport } from "@/lib/types";
import { defaultDataSource } from "@/lib/dataSource";
import { GET as publishedOpportunities } from "../cotes-value/route";
import {
  SERVER_DETECTION_OWNER_HASH,
  SYSTEM_QUOTA_OPPORTUNITY_ID,
} from "@/lib/serverTracker";

function confidence(score: number): Opportunity["confidence"] {
  if (score >= 85) return "Forte";
  if (score >= 70) return "Moyenne";
  return "Faible";
}

function sportValue(value: unknown): Sport {
  return String(value || "Autre") as Sport;
}

function parseOpportunity(row: Record<string, unknown>): Opportunity | null {
  const id = String(row.opportunity_id ?? "");
  const parts = id.split("|");
  if (parts.length !== 8 || parts[0] !== "v2") return null;
  const startUnix = Number(parts[3]);
  if (!Number.isFinite(startUnix) || startUnix * 1000 <= Date.now())
    return null;

  const bookmakerOdds = Number(row.odds);
  const evPct = Number(row.initial_ev_pct);
  const opportunityScore = Number(row.opportunity_score);
  if (!Number.isFinite(bookmakerOdds) || bookmakerOdds <= 1) return null;
  if (!Number.isFinite(evPct) || evPct <= 0 || evPct > 25) return null;
  if (
    !Number.isFinite(opportunityScore) ||
    opportunityScore < 0 ||
    opportunityScore > 100
  )
    return null;
  const fairOdds = bookmakerOdds / (1 + evPct / 100);
  const updatedAt = Date.parse(String(row.updated_at));
  const freshnessSeconds = Number.isFinite(updatedAt)
    ? Math.max(0, Math.round((Date.now() - updatedAt) / 1000))
    : Number.MAX_SAFE_INTEGER;
  if (freshnessSeconds > 900 || updatedAt > Date.now() + 30000 || fairOdds <= 1)
    return null;

  const score = Math.min(
    opportunityScore,
    evidenceScore({
      evPct,
      ageSeconds: freshnessSeconds,
      marketVerified: true,
      consensus: false,
    }),
  );
  return {
    id,
    sport: sportValue(row.sport),
    competition: String(row.competition ?? ""),
    event: String(row.event ?? ""),
    startTime: new Date(startUnix * 1000).toISOString(),
    market: String(row.market ?? "Résultat / H2H"),
    selection: String(row.selection ?? ""),
    bookmaker: String(row.bookmaker ?? ""),
    bookmakerOdds,
    referenceOdds: 0,
    fairOdds,
    evPct,
    opportunityScore: score,
    freshnessSeconds,
    confidence: confidence(score),
    highOddsGuard: passesHighOddsGuard(bookmakerOdds, score, evPct),
    isBoost: false,
    reference: "Pinnacle",
    observedAt: new Date(updatedAt).toISOString(),
    qualityNote:
      "Score plafonné par la qualité enregistrée et recalculé : EV (35), référence (20), fraîcheur (20), marché (20). Cote brute non conservée ; liquidité et stabilité non notées.",
  };
}

export async function GET(request: Request) {
  const requested = new URL(request.url).searchParams.get("mode");
  if (
    requested &&
    !["demo", "live", "theoddsapi", "cotes-value"].includes(requested)
  )
    return Response.json(
      { error: "invalid_source", opportunities: [] },
      { status: 400 },
    );
  const mode = defaultDataSource(requested || process.env.DEFAULT_DATA_SOURCE);
  if (mode === "cotes-value") return publishedOpportunities();
  if (mode === "demo") {
    return Response.json({
      provider: "demo",
      source: "demo",
      demo: true,
      generatedAt: new Date().toISOString(),
      quota: null,
      opportunities: demoOpportunities(),
    });
  }
  const pool = getDbPool();
  if (!pool) {
    return Response.json(
      {
        provider: "theoddsapi",
        source: "radar-cache",
        demo: false,
        liveConfigured: Boolean(process.env.THE_ODDS_API_KEY?.trim()),
        generatedAt: new Date().toISOString(),
        quota: null,
        opportunities: [],
        error: "database_not_configured",
      },
      { status: 503 },
    );
  }

  try {
    const [opportunityRows, quotaRows] = await Promise.all([
      pool.query(
        `SELECT opportunity_id, updated_at, sport, competition, event, market, selection,
                bookmaker, odds, initial_ev_pct, opportunity_score
           FROM public.bet_history
          WHERE owner_hash = $1
            AND status = 'open'
            AND LEFT(opportunity_id, 3) = 'v2|'
          ORDER BY updated_at DESC
          LIMIT 1000`,
        [SERVER_DETECTION_OWNER_HASH],
      ),
      pool.query(
        `SELECT initial_ev_pct AS used, stake AS remaining, updated_at
           FROM public.bet_history
          WHERE owner_hash = $1 AND opportunity_id = $2
          LIMIT 1`,
        [SERVER_DETECTION_OWNER_HASH, SYSTEM_QUOTA_OPPORTUNITY_ID],
      ),
    ]);

    const opportunities = (
      opportunityRows.rows as Array<Record<string, unknown>>
    )
      .map(parseOpportunity)
      .filter((item): item is Opportunity => item !== null)
      .sort(
        (a, b) => b.opportunityScore - a.opportunityScore || b.evPct - a.evPct,
      );

    const quotaRow = quotaRows.rows[0] as Record<string, unknown> | undefined;
    const quota = quotaRow
      ? {
          used: Number(quotaRow.used) || 0,
          remaining: Number(quotaRow.remaining) || 0,
          lastCost: null,
          updatedAt: new Date(String(quotaRow.updated_at)).toISOString(),
        }
      : null;

    return Response.json({
      provider: "theoddsapi",
      source: "radar-cache",
      demo: false,
      liveConfigured: Boolean(process.env.THE_ODDS_API_KEY?.trim()),
      generatedAt: new Date().toISOString(),
      quota,
      opportunities,
    });
  } catch (error) {
    console.error("opportunity_snapshot_read_failed", error);
    return Response.json(
      {
        provider: "theoddsapi",
        source: "radar-cache",
        demo: false,
        liveConfigured: Boolean(process.env.THE_ODDS_API_KEY?.trim()),
        generatedAt: new Date().toISOString(),
        quota: null,
        opportunities: [],
        error: "opportunity_snapshot_read_failed",
      },
      { status: 500 },
    );
  }
}
