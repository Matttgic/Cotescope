import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";

export async function GET() {
  const pool = getDbPool();
  if (!pool) {
    return NextResponse.json({ ok: false, database: "not_configured" }, { status: 503 });
  }

  try {
    await pool.query("SELECT 1");
    return NextResponse.json({ ok: true, database: "connected" });
  } catch (error) {
    console.error("tracker_health_failed", error);
    return NextResponse.json({ ok: false, database: "error" }, { status: 500 });
  }
}
