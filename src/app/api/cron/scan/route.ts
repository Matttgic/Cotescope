import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { fetchFrenchH2HOpportunities } from "@/lib/providers/theOddsApi";
import { fetchRadarWindow, type RadarSportWindow } from "@/lib/providers/theOddsApiRadar";
import {
  MONTHLY_AUTOMATION_HARD_CAP,
  MONTHLY_ODDS_SCAN_CAP,
  canSpendOddsCredits,
} from "@/lib/quotaPolicy";
import {
  SERVER_DETECTION_OWNER_HASH,
  SYSTEM_ODDS_SCAN_PREFIX,
  SYSTEM_QUOTA_OPPORTUNITY_ID,
  SYSTEM_RADAR_PREFIX,
} from "@/lib/serverTracker";

const MIN_EV_PCT = 2;
const MAX_STANDARD_ODDS = 4;
const RADAR_WINDOW_MINUTES = 90;
const PAID_SCAN_COOLDOWN_MS = 60 * 60 * 1000;
const FINAL_REFRESH_LEAD_MS = 20 * 60 * 1000;
const FINAL_REFRESH_COOLDOWN_MS = 30 * 60 * 1000;

type QuotaState = {
  used: number;
  remaining: number;
  updatedAt: number;
};

type RadarMarker = {
  eventCount: number;
  eventHash: string;
  updatedAt: number;
};

type PaidScanMarker = {
  updatedAt: number;
};

type MarkerMaps = {
  radar: Map<string, RadarMarker>;
  paid: Map<string, PaidScanMarker>;
};

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

async function readMarkerMaps(): Promise<MarkerMaps> {
  const pool = getDbPool();
  if (!pool) return { radar: new Map(), paid: new Map() };
  const result = await pool.query(
    `SELECT opportunity_id, updated_at, stake, selection
       FROM public.bet_history
      WHERE owner_hash = $1
        AND (
          LEFT(opportunity_id, LENGTH($2)) = $2 OR
          LEFT(opportunity_id, LENGTH($3)) = $3
        )`,
    [SERVER_DETECTION_OWNER_HASH, SYSTEM_RADAR_PREFIX, SYSTEM_ODDS_SCAN_PREFIX],
  );

  const radar = new Map<string, RadarMarker>();
  const paid = new Map<string, PaidScanMarker>();
  for (const row of result.rows as Array<Record<string, unknown>>) {
    const opportunityId = String(row.opportunity_id ?? "");
    const updatedAt = Date.parse(String(row.updated_at)) || 0;
    if (opportunityId.startsWith(SYSTEM_RADAR_PREFIX)) {
      radar.set(opportunityId.slice(SYSTEM_RADAR_PREFIX.length), {
        eventCount: Number(row.stake) || 0,
        eventHash: String(row.selection ?? ""),
        updatedAt,
      });
    } else if (opportunityId.startsWith(SYSTEM_ODDS_SCAN_PREFIX)) {
      paid.set(opportunityId.slice(SYSTEM_ODDS_SCAN_PREFIX.length), { updatedAt });
    }
  }
  return { radar, paid };
}

function stableDetectionId(opportunityId: string) {
  return `cron-${createHash("sha256").update(opportunityId).digest("hex").slice(0, 32)}`;
}

function stableSystemId(kind: "radar" | "odds", sportKey: string) {
  return `system-${kind}-${createHash("sha1").update(sportKey).digest("hex").slice(0, 24)}`;
}

function scanReason(sport: RadarSportWindow, previous: RadarMarker | undefined, paid: PaidScanMarker | undefined) {
  const now = Date.now();
  const lastPaidAt = paid?.updatedAt ?? 0;
  const elapsed = lastPaidAt ? now - lastPaidAt : Number.POSITIVE_INFINITY;
  const firstStart = Date.parse(sport.firstStart);
  const nearStart = Number.isFinite(firstStart) && firstStart - now <= FINAL_REFRESH_LEAD_MS;

  if (!paid) return "new_sport";
  if (previous && sport.eventCount > previous.eventCount) return "new_events";
  if (nearStart && elapsed >= FINAL_REFRESH_COOLDOWN_MS) return "final_refresh";
  if (elapsed >= PAID_SCAN_COOLDOWN_MS) return "hourly_refresh";
  return null;
}

async function upsertQuotaState(
  client: { query: (text: string, values?: unknown[]) => Promise<unknown> },
  quota: { used: number | null; remaining: number | null },
  now: string,
) {
  if (quota.used == null || quota.remaining == null) return;
  const total = quota.used + quota.remaining;
  const quotaPct = total > 0 ? Math.round((quota.used / total) * 100) : 0;
  await client.query(
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

  try {
    const [previousQuota, markers, radar] = await Promise.all([
      readQuotaState(),
      readMarkerMaps(),
      fetchRadarWindow(RADAR_WINDOW_MINUTES),
    ]);

    let currentUsed = radar.quota.used ?? previousQuota?.used ?? 0;
    let currentRemaining = radar.quota.remaining ?? previousQuota?.remaining ?? 0;
    const paidScans: Array<{ sportKey: string; reason: string; cost: number | null }> = [];
    const detected = [] as Awaited<ReturnType<typeof fetchFrenchH2HOpportunities>>["opportunities"];
    const scanErrors: string[] = [];

    for (const sport of radar.activeSports) {
      const reason = scanReason(sport, markers.radar.get(sport.key), markers.paid.get(sport.key));
      if (!reason) continue;
      if (!canSpendOddsCredits(currentUsed, 1)) break;

      try {
        const result = await fetchFrenchH2HOpportunities(sport.key, {
          commenceTimeFrom: radar.from,
          commenceTimeTo: radar.to,
        });
        detected.push(...result.opportunities.filter((item) =>
          item.evPct >= MIN_EV_PCT &&
          item.bookmakerOdds <= MAX_STANDARD_ODDS &&
          item.highOddsGuard,
        ));
        if (result.quota.used != null) currentUsed = result.quota.used;
        else currentUsed += result.quota.lastCost ?? 1;
        if (result.quota.remaining != null) currentRemaining = result.quota.remaining;
        paidScans.push({ sportKey: sport.key, reason, cost: result.quota.lastCost });
      } catch (error) {
        scanErrors.push(`${sport.key}: ${error instanceof Error ? error.message : "odds_scan_error"}`);
      }
    }

    const now = new Date().toISOString();
    const client = await pool.connect();
    let saved = 0;
    try {
      await client.query("BEGIN");
      await upsertQuotaState(client, { used: currentUsed, remaining: currentRemaining }, now);

      for (const sport of radar.activeSports) {
        await client.query(
          `INSERT INTO public.bet_history
            (id, owner_hash, opportunity_id, created_at, updated_at, sport, competition, event, market,
             selection, bookmaker, odds, stake, initial_ev_pct, opportunity_score, status)
           VALUES ($1,$2,$3,$4,$4,'Autre',$5,$6,'radar',$7,'The Odds API',1.01,$8,0,0,'open')
           ON CONFLICT (owner_hash, opportunity_id) DO UPDATE SET
             updated_at = EXCLUDED.updated_at,
             competition = EXCLUDED.competition,
             event = EXCLUDED.event,
             selection = EXCLUDED.selection,
             stake = EXCLUDED.stake`,
          [
            stableSystemId("radar", sport.key),
            SERVER_DETECTION_OWNER_HASH,
            `${SYSTEM_RADAR_PREFIX}${sport.key}`,
            now,
            sport.title,
            `${sport.firstStart} → ${sport.lastStart}`,
            sport.eventHash,
            sport.eventCount,
          ],
        );
      }

      for (const scan of paidScans) {
        await client.query(
          `INSERT INTO public.bet_history
            (id, owner_hash, opportunity_id, created_at, updated_at, sport, competition, event, market,
             selection, bookmaker, odds, stake, initial_ev_pct, opportunity_score, status)
           VALUES ($1,$2,$3,$4,$4,'Autre','System',$5,'odds_scan',$6,'The Odds API',1.01,0,0,0,'open')
           ON CONFLICT (owner_hash, opportunity_id) DO UPDATE SET
             updated_at = EXCLUDED.updated_at,
             event = EXCLUDED.event,
             selection = EXCLUDED.selection`,
          [
            stableSystemId("odds", scan.sportKey),
            SERVER_DETECTION_OWNER_HASH,
            `${SYSTEM_ODDS_SCAN_PREFIX}${scan.sportKey}`,
            now,
            scan.sportKey,
            scan.reason,
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
           ON CONFLICT (owner_hash, opportunity_id) DO UPDATE SET
             updated_at = EXCLUDED.updated_at,
             sport = EXCLUDED.sport,
             competition = EXCLUDED.competition,
             event = EXCLUDED.event,
             market = EXCLUDED.market,
             selection = EXCLUDED.selection,
             bookmaker = EXCLUDED.bookmaker,
             odds = EXCLUDED.odds,
             initial_ev_pct = EXCLUDED.initial_ev_pct,
             opportunity_score = EXCLUDED.opportunity_score`,
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
      source: "theoddsapi:all-sports-radar",
      radar: {
        windowMinutes: RADAR_WINDOW_MINUTES,
        sportsChecked: radar.sportsChecked,
        sportsWithEvents: radar.activeSports.length,
        freeErrors: radar.errors.slice(0, 10),
      },
      paid: {
        scans: paidScans.length,
        sports: paidScans,
        oddsScanCap: MONTHLY_ODDS_SCAN_CAP,
        hardCap: MONTHLY_AUTOMATION_HARD_CAP,
      },
      detected: detected.length,
      saved,
      quota: { used: currentUsed, remaining: currentRemaining },
      errors: scanErrors.slice(0, 10),
    });
  } catch (error) {
    console.error("cron_scan_failed", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "cron_scan_failed" },
      { status: 500 },
    );
  }
}
