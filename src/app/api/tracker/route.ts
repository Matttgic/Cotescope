import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { SERVER_DETECTION_OWNER_HASH, SYSTEM_QUOTA_OPPORTUNITY_ID } from "@/lib/serverTracker";

const VALID_STATUSES = new Set(["open", "win", "loss", "void"]);
const KEY_PATTERN = /^[a-f0-9]{64}$/i;

type ApiBet = {
  id: string;
  opportunityId: string;
  createdAt: string;
  updatedAt?: string;
  sport: string;
  competition: string;
  event: string;
  market: string;
  selection: string;
  bookmaker: string;
  odds: number;
  stake: number;
  initialEvPct: number;
  opportunityScore: number;
  status: "open" | "win" | "loss" | "void";
};

function ownerHash(request: NextRequest) {
  const key = request.headers.get("x-tracker-key")?.trim() ?? "";
  if (!KEY_PATTERN.test(key)) return null;
  return createHash("sha256").update(key).digest("hex");
}

function toFiniteNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeBet(value: unknown): ApiBet | null {
  if (!value || typeof value !== "object") return null;
  const bet = value as Record<string, unknown>;
  const status = String(bet.status ?? "open");
  if (!VALID_STATUSES.has(status)) return null;

  const normalized: ApiBet = {
    id: String(bet.id ?? "").slice(0, 180),
    opportunityId: String(bet.opportunityId ?? "").slice(0, 180),
    createdAt: String(bet.createdAt ?? ""),
    updatedAt: String(bet.updatedAt ?? bet.createdAt ?? ""),
    sport: String(bet.sport ?? "Autre").slice(0, 80),
    competition: String(bet.competition ?? "").slice(0, 160),
    event: String(bet.event ?? "").slice(0, 240),
    market: String(bet.market ?? "").slice(0, 160),
    selection: String(bet.selection ?? "").slice(0, 240),
    bookmaker: String(bet.bookmaker ?? "").slice(0, 120),
    odds: Math.max(1.01, toFiniteNumber(bet.odds, 1.01)),
    stake: Math.max(0, toFiniteNumber(bet.stake, 0)),
    initialEvPct: toFiniteNumber(bet.initialEvPct, 0),
    opportunityScore: Math.min(100, Math.max(0, Math.round(toFiniteNumber(bet.opportunityScore, 0)))),
    status: status as ApiBet["status"],
  };

  if (!normalized.id || !normalized.opportunityId || !normalized.event || !normalized.market || !normalized.selection || !normalized.bookmaker) return null;
  if (Number.isNaN(Date.parse(normalized.createdAt))) normalized.createdAt = new Date().toISOString();
  if (!normalized.updatedAt || Number.isNaN(Date.parse(normalized.updatedAt))) normalized.updatedAt = normalized.createdAt;
  return normalized;
}

function mapRow(row: Record<string, unknown>): ApiBet {
  return {
    id: String(row.id),
    opportunityId: String(row.opportunity_id),
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
    sport: String(row.sport),
    competition: String(row.competition),
    event: String(row.event),
    market: String(row.market),
    selection: String(row.selection),
    bookmaker: String(row.bookmaker),
    odds: Number(row.odds),
    stake: Number(row.stake),
    initialEvPct: Number(row.initial_ev_pct),
    opportunityScore: Number(row.opportunity_score),
    status: String(row.status) as ApiBet["status"],
  };
}

export async function GET(request: NextRequest) {
  const hash = ownerHash(request);
  if (!hash) return NextResponse.json({ error: "invalid_tracker_key" }, { status: 401 });
  const pool = getDbPool();
  if (!pool) return NextResponse.json({ error: "database_not_configured" }, { status: 503 });

  try {
    const result = await pool.query(
      `WITH ranked AS (
         SELECT id, opportunity_id, created_at, updated_at, sport, competition, event, market,
                selection, bookmaker, odds, stake, initial_ev_pct, opportunity_score, status,
                ROW_NUMBER() OVER (
                  PARTITION BY opportunity_id
                  ORDER BY CASE WHEN owner_hash = $1 THEN 0 ELSE 1 END, updated_at DESC
                ) AS rn
           FROM public.bet_history
          WHERE owner_hash IN ($1, $2)
            AND opportunity_id <> $3
       )
       SELECT id, opportunity_id, created_at, updated_at, sport, competition, event, market,
              selection, bookmaker, odds, stake, initial_ev_pct, opportunity_score, status
         FROM ranked
        WHERE rn = 1
        ORDER BY created_at DESC
        LIMIT 1000`,
      [hash, SERVER_DETECTION_OWNER_HASH, SYSTEM_QUOTA_OPPORTUNITY_ID],
    );

    return NextResponse.json({ bets: result.rows.map(mapRow), cloud: true });
  } catch (error) {
    console.error("tracker_read_failed", error);
    return NextResponse.json({ error: "tracker_read_failed" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const hash = ownerHash(request);
  if (!hash) return NextResponse.json({ error: "invalid_tracker_key" }, { status: 401 });
  const pool = getDbPool();
  if (!pool) return NextResponse.json({ error: "database_not_configured" }, { status: 503 });

  const payload = await request.json().catch(() => null) as { bets?: unknown[] } | null;
  const bets = Array.isArray(payload?.bets) ? payload!.bets.slice(0, 500).map(normalizeBet).filter(Boolean) as ApiBet[] : [];
  if (bets.length === 0) return NextResponse.json({ saved: 0 });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const bet of bets) {
      await client.query(
        `INSERT INTO public.bet_history
          (id, owner_hash, opportunity_id, created_at, updated_at, sport, competition, event, market,
           selection, bookmaker, odds, stake, initial_ev_pct, opportunity_score, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
         ON CONFLICT (owner_hash, opportunity_id) DO UPDATE SET
           updated_at = EXCLUDED.updated_at,
           sport = EXCLUDED.sport,
           competition = EXCLUDED.competition,
           event = EXCLUDED.event,
           market = EXCLUDED.market,
           selection = EXCLUDED.selection,
           bookmaker = EXCLUDED.bookmaker,
           odds = EXCLUDED.odds,
           stake = EXCLUDED.stake,
           initial_ev_pct = EXCLUDED.initial_ev_pct,
           opportunity_score = EXCLUDED.opportunity_score,
           status = EXCLUDED.status`,
        [
          bet.id, hash, bet.opportunityId, bet.createdAt, bet.updatedAt, bet.sport, bet.competition,
          bet.event, bet.market, bet.selection, bet.bookmaker, bet.odds, bet.stake,
          bet.initialEvPct, bet.opportunityScore, bet.status,
        ],
      );
    }
    await client.query("COMMIT");
    return NextResponse.json({ saved: bets.length, cloud: true });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("tracker_save_failed", error);
    return NextResponse.json({ error: "tracker_save_failed" }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function DELETE(request: NextRequest) {
  const hash = ownerHash(request);
  if (!hash) return NextResponse.json({ error: "invalid_tracker_key" }, { status: 401 });
  const pool = getDbPool();
  if (!pool) return NextResponse.json({ error: "database_not_configured" }, { status: 503 });
  const id = request.nextUrl.searchParams.get("id")?.slice(0, 180);
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  const result = await pool.query(
    `DELETE FROM public.bet_history
      WHERE id = $1
        AND owner_hash IN ($2, $3)
        AND opportunity_id <> $4`,
    [id, hash, SERVER_DETECTION_OWNER_HASH, SYSTEM_QUOTA_OPPORTUNITY_ID],
  );
  return NextResponse.json({ deleted: result.rowCount ?? 0, cloud: true });
}
