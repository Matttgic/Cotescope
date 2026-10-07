import { needsTrackerUpgrade } from "@/lib/trackerSchema";
import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";

export async function GET() {
  const pool = getDbPool();
  if (!pool) {
    return NextResponse.json(
      { ok: false, database: "not_configured" },
      { status: 503 },
    );
  }

  try {
    await pool.query("SELECT capture FROM public.bet_history LIMIT 0");
    const constraint = await pool.query(
      "SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid = 'public.bet_history'::regclass AND conname = 'bet_history_status_check'",
    );
    const definition = String(constraint.rows[0]?.definition || "");
    if (!definition.includes("half_win") || !definition.includes("half_loss"))
      return NextResponse.json(
        { ok: false, error: "tracker_schema_upgrade_required" },
        { status: 503 },
      );
    return NextResponse.json({
      ok: true,
      database: "connected",
      captureColumn: true,
      partialSettlements: true,
    });
  } catch (error) {
    if (needsTrackerUpgrade(error))
      return NextResponse.json(
        { ok: false, error: "tracker_schema_upgrade_required" },
        { status: 503 },
      );
    console.error("tracker_health_failed", error);
    return NextResponse.json({ ok: false, database: "error" }, { status: 500 });
  }
}
