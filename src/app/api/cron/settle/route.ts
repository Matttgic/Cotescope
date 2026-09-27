import { NextRequest, NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { fetchRecentScores, type CompletedScoreEvent } from "@/lib/providers/theOddsApiScores";
import {
  SERVER_DETECTION_OWNER_HASH,
  SYSTEM_QUOTA_OPPORTUNITY_ID,
  SYSTEM_SETTLEMENT_OPPORTUNITY_ID,
} from "@/lib/serverTracker";

type BetStatus = "win" | "loss" | "void";

type OpenDetection = {
  opportunityId: string;
  selection: string;
  event: string;
  sportKey: string;
  providerEventId: string;
  startUnix: number;
  outcomeCount: number;
};

type QuotaState = {
  used: number;
  remaining: number;
};

const MIN_AFTER_START_MS = 30 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

function parseOpportunityId(opportunityId: string): Omit<OpenDetection, "selection" | "event"> | null {
  const parts = opportunityId.split("|");
  if (parts.length !== 8 || parts[0] !== "v2") return null;

  const providerEventId = parts[1];
  const sportKey = parts[2];
  const startUnix = Number(parts[3]);
  const outcomeCount = Number(parts[6]);

  if (!providerEventId || !/^[a-z0-9_]+$/.test(sportKey)) return null;
  if (!Number.isFinite(startUnix) || startUnix <= 0) return null;
  if (!Number.isInteger(outcomeCount) || outcomeCount < 2 || outcomeCount > 4) return null;

  return { opportunityId, providerEventId, sportKey, startUnix, outcomeCount };
}

function numericScore(event: CompletedScoreEvent, team: string) {
  const value = event.scores?.find((item) => item.name === team)?.score;
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function settleH2H(detection: OpenDetection, result: CompletedScoreEvent): BetStatus | null {
  if (!result.completed || !Array.isArray(result.scores) || result.scores.length < 2) return null;

  const homeScore = numericScore(result, result.home_team);
  const awayScore = numericScore(result, result.away_team);
  if (homeScore == null || awayScore == null) return null;

  const selection = detection.selection;
  const isHome = selection === result.home_team;
  const isAway = selection === result.away_team;
  const isDraw = selection.toLowerCase() === "draw";
  if (!isHome && !isAway && !isDraw) return null;

  if (homeScore === awayScore) {
    if (detection.outcomeCount >= 3) return isDraw ? "win" : "loss";
    return "void";
  }

  if (isDraw) return "loss";
  const winner = homeScore > awayScore ? result.home_team : result.away_team;
  return selection === winner ? "win" : "loss";
}

function settlementIntervalMs(quota: QuotaState | null) {
  if (!quota) return 2 * HOUR_MS;
  const total = quota.used + quota.remaining;
  const ratio = total > 0 ? quota.used / total : 0;
  if (ratio >= 0.95) return null;
  if (ratio >= 0.85) return 6 * HOUR_MS;
  if (ratio >= 0.70) return 3 * HOUR_MS;
  return 2 * HOUR_MS;
}

async function readQuotaState() {
  const pool = getDbPool();
  if (!pool) return null;
  const result = await pool.query(
    `SELECT initial_ev_pct AS used, stake AS remaining
       FROM public.bet_history
      WHERE owner_hash = $1 AND opportunity_id = $2
      LIMIT 1`,
    [SERVER_DETECTION_OWNER_HASH, SYSTEM_QUOTA_OPPORTUNITY_ID],
  );
  if (result.rows.length === 0) return null;
  return {
    used: Number(result.rows[0].used) || 0,
    remaining: Number(result.rows[0].remaining) || 0,
  } satisfies QuotaState;
}

async function readLastSettlementAt() {
  const pool = getDbPool();
  if (!pool) return 0;
  const result = await pool.query(
    `SELECT updated_at
       FROM public.bet_history
      WHERE owner_hash = $1 AND opportunity_id = $2
      LIMIT 1`,
    [SERVER_DETECTION_OWNER_HASH, SYSTEM_SETTLEMENT_OPPORTUNITY_ID],
  );
  return result.rows.length > 0 ? Date.parse(String(result.rows[0].updated_at)) || 0 : 0;
}

async function markSettlementRun(checked: number, settled: number) {
  const pool = getDbPool();
  if (!pool) return;
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO public.bet_history
      (id, owner_hash, opportunity_id, created_at, updated_at, sport, competition, event, market,
       selection, bookmaker, odds, stake, initial_ev_pct, opportunity_score, status)
     VALUES ('system-settlement',$1,$2,$3,$3,'Autre','System','CoteScope settlement','settlement',
             'automatic','The Odds API',1.01,$4,$5,0,'open')
     ON CONFLICT (owner_hash, opportunity_id) DO UPDATE SET
       updated_at = EXCLUDED.updated_at,
       stake = EXCLUDED.stake,
       initial_ev_pct = EXCLUDED.initial_ev_pct`,
    [SERVER_DETECTION_OWNER_HASH, SYSTEM_SETTLEMENT_OPPORTUNITY_ID, now, settled, checked],
  );
}

async function updateQuotaState(quota: { used: number | null; remaining: number | null }) {
  if (quota.used == null || quota.remaining == null) return;
  const pool = getDbPool();
  if (!pool) return;
  const total = quota.used + quota.remaining;
  const quotaPct = total > 0 ? Math.round((quota.used / total) * 100) : 0;
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO public.bet_history
      (id, owner_hash, opportunity_id, created_at, updated_at, sport, competition, event, market,
       selection, bookmaker, odds, stake, initial_ev_pct, opportunity_score, status)
     VALUES ('system-quota',$1,$2,$3,$3,'Autre','System','CoteScope quota','quota','remaining','The Odds API',1.01,$4,$5,$6,'open')
     ON CONFLICT (owner_hash, opportunity_id) DO UPDATE SET
       updated_at = EXCLUDED.updated_at,
       stake = EXCLUDED.stake,
       initial_ev_pct = EXCLUDED.initial_ev_pct,
       opportunity_score = EXCLUDED.opportunity_score`,
    [SERVER_DETECTION_OWNER_HASH, SYSTEM_QUOTA_OPPORTUNITY_ID, now, quota.remaining, quota.used, quotaPct],
  );
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ ok: false, error: "cron_secret_not_configured" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const pool = getDbPool();
  if (!pool) {
    return NextResponse.json({ ok: false, error: "database_not_configured" }, { status: 503 });
  }

  const quota = await readQuotaState();
  const interval = settlementIntervalMs(quota);
  if (interval == null) {
    return NextResponse.json({ ok: true, skipped: "quota_guard_95pct" });
  }

  const lastSettlementAt = await readLastSettlementAt();
  if (lastSettlementAt && Date.now() - lastSettlementAt < interval - 30_000) {
    return NextResponse.json({
      ok: true,
      skipped: "settlement_interval",
      retryAfterSeconds: Math.max(1, Math.ceil((interval - (Date.now() - lastSettlementAt)) / 1000)),
    });
  }

  const rows = await pool.query(
    `SELECT DISTINCT ON (opportunity_id)
            opportunity_id, selection, event
       FROM public.bet_history
      WHERE status = 'open'
        AND opportunity_id LIKE 'v2|%'
      ORDER BY opportunity_id, updated_at DESC
      LIMIT 1000`,
  );

  const due: OpenDetection[] = [];
  for (const row of rows.rows as Array<Record<string, unknown>>) {
    const opportunityId = String(row.opportunity_id ?? "");
    const parsed = parseOpportunityId(opportunityId);
    if (!parsed) continue;
    if (parsed.startUnix * 1000 > Date.now() - MIN_AFTER_START_MS) continue;
    due.push({
      ...parsed,
      selection: String(row.selection ?? ""),
      event: String(row.event ?? ""),
    });
  }

  if (due.length === 0) {
    return NextResponse.json({ ok: true, checked: 0, settled: 0, skipped: "no_due_open_bets" });
  }

  const bySport = new Map<string, OpenDetection[]>();
  for (const detection of due) {
    const group = bySport.get(detection.sportKey) ?? [];
    group.push(detection);
    bySport.set(detection.sportKey, group);
  }

  let checked = 0;
  let settled = 0;
  let wins = 0;
  let losses = 0;
  let voids = 0;
  const unsupportedSports: string[] = [];
  const errors: string[] = [];

  for (const [sportKey, detections] of bySport) {
    try {
      const scores = await fetchRecentScores(sportKey);
      await updateQuotaState(scores.quota);
      if (scores.unsupported) {
        unsupportedSports.push(sportKey);
        continue;
      }

      const resultById = new Map(scores.events.map((event) => [event.id, event]));
      for (const detection of detections) {
        checked += 1;
        const result = resultById.get(detection.providerEventId);
        if (!result) continue;
        const status = settleH2H(detection, result);
        if (!status) continue;

        const update = await pool.query(
          `UPDATE public.bet_history
              SET status = $1, updated_at = $2
            WHERE opportunity_id = $3
              AND status = 'open'`,
          [status, new Date().toISOString(), detection.opportunityId],
        );
        if ((update.rowCount ?? 0) > 0) {
          settled += 1;
          if (status === "win") wins += 1;
          else if (status === "loss") losses += 1;
          else voids += 1;
        }
      }
    } catch (error) {
      errors.push(`${sportKey}: ${error instanceof Error ? error.message : "score_error"}`);
    }
  }

  await markSettlementRun(checked, settled);

  return NextResponse.json({
    ok: true,
    checked,
    settled,
    wins,
    losses,
    voids,
    unsupportedSports,
    errors,
  });
}
