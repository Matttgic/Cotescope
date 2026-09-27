import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { fetchFrenchH2HOpportunities } from "@/lib/providers/theOddsApi";
import { SERVER_DETECTION_OWNER_HASH, SYSTEM_QUOTA_OPPORTUNITY_ID } from "@/lib/serverTracker";

const MIN_EV_PCT = 2;
const MAX_STANDARD_ODDS = 4;

type QuotaState = {
  used: number;
  remaining: number;
  updatedAt: number;
};

function parisHour() {
  const value = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Paris",
    hour: "2-digit",
    hour12: false,
  }).format(new Date());
  return Number(value);
}

function desiredIntervalMs(state: QuotaState | null) {
  const hour = parisHour();
  const daytime = hour >= 8 || hour < 1;
  const total = state ? state.used + state.remaining : 0;
  const ratio = state && total > 0 ? state.used / total : 0;
  const minute = 60 * 1000;

  if (ratio >= 0.95) return null;
  if (ratio >= 0.85) return daytime ? 30 * minute : 120 * minute;
  if (ratio >= 0.70) return daytime ? 20 * minute : 90 * minute;
  return daytime ? 15 * minute : 60 * minute;
}

async function readQuotaState() {
  const pool = getDbPool();
  if (!pool) return null;
  const result = await pool.query(
    `SELECT initial_ev_pct AS used, stake AS remaining, updated_at
       FROM public.bet_history
      WHERE owner_hash = $1 AND opportunity_id = $2
      LIMIT 1`,
    [SERVER_DETECTION_OWNER_HASH, SYSTEM_QUOTA_OPPORTUNITY_ID],
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0] as Record<string, unknown>;
  return {
    used: Number(row.used) || 0,
    remaining: Number(row.remaining) || 0,
    updatedAt: Date.parse(String(row.updated_at)) || 0,
  } satisfies QuotaState;
}

function stableDetectionId(opportunityId: string) {
  return `cron-${createHash("sha256").update(opportunityId).digest("hex").slice(0, 32)}`;
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

  const previousQuota = await readQuotaState();
  const desiredInterval = desiredIntervalMs(previousQuota);
  if (desiredInterval == null) {
    return NextResponse.json({ ok: true, skipped: "quota_guard_95pct" });
  }

  if (previousQuota?.updatedAt) {
    const elapsed = Date.now() - previousQuota.updatedAt;
    if (elapsed < desiredInterval - 30_000) {
      return NextResponse.json({
        ok: true,
        skipped: "adaptive_interval",
        retryAfterSeconds: Math.max(1, Math.ceil((desiredInterval - elapsed) / 1000)),
      });
    }
  }

  try {
    const result = await fetchFrenchH2HOpportunities("upcoming");
    const detected = result.opportunities.filter((item) =>
      item.evPct >= MIN_EV_PCT &&
      item.bookmakerOdds <= MAX_STANDARD_ODDS &&
      item.highOddsGuard,
    );

    const now = new Date().toISOString();
    const client = await pool.connect();
    let saved = 0;
    try {
      await client.query("BEGIN");

      if (result.quota.used != null && result.quota.remaining != null) {
        const total = result.quota.used + result.quota.remaining;
        const quotaPct = total > 0 ? Math.round((result.quota.used / total) * 100) : 0;
        await client.query(
          `INSERT INTO public.bet_history
            (id, owner_hash, opportunity_id, created_at, updated_at, sport, competition, event, market,
             selection, bookmaker, odds, stake, initial_ev_pct, opportunity_score, status)
           VALUES ($1,$2,$3,$4,$4,'Autre','System','CoteScope quota','quota','remaining','The Odds API',1.01,$5,$6,$7,'open')
           ON CONFLICT (owner_hash, opportunity_id) DO UPDATE SET
             updated_at = EXCLUDED.updated_at,
             stake = EXCLUDED.stake,
             initial_ev_pct = EXCLUDED.initial_ev_pct,
             opportunity_score = EXCLUDED.opportunity_score`,
          [
            "system-quota",
            SERVER_DETECTION_OWNER_HASH,
            SYSTEM_QUOTA_OPPORTUNITY_ID,
            now,
            result.quota.remaining,
            result.quota.used,
            quotaPct,
          ],
        );
      }

      for (const item of detected) {
        const opportunityId = item.id.slice(0, 180);
        const insert = await client.query(
          `INSERT INTO public.bet_history
            (id, owner_hash, opportunity_id, created_at, updated_at, sport, competition, event, market,
             selection, bookmaker, odds, stake, initial_ev_pct, opportunity_score, status)
           VALUES ($1,$2,$3,$4,$4,$5,$6,$7,$8,$9,$10,$11,10,$12,$13,'open')
           ON CONFLICT (owner_hash, opportunity_id) DO NOTHING`,
          [
            stableDetectionId(opportunityId),
            SERVER_DETECTION_OWNER_HASH,
            opportunityId,
            now,
            item.sport,
            item.competition,
            item.event,
            item.market,
            item.selection,
            item.bookmaker,
            item.bookmakerOdds,
            item.evPct,
            item.opportunityScore,
          ],
        );
        saved += insert.rowCount ?? 0;
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    return NextResponse.json({
      ok: true,
      scannedAt: now,
      detected: detected.length,
      saved,
      quota: result.quota,
      source: "theoddsapi:upcoming",
    });
  } catch (error) {
    console.error("cron_scan_failed", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "cron_scan_failed" },
      { status: 500 },
    );
  }
}
