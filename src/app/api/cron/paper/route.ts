import { createHash, timingSafeEqual } from "crypto";
import { readPublishedFeed } from "@/lib/publishedFeed";
import { runPaperCycle } from "@/lib/paperStore";
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret)
    return Response.json(
      { ok: false, error: "cron_secret_missing" },
      { status: 503 },
    );
  const expected = createHash("sha256")
    .update("Bearer " + secret)
    .digest();
  const actual = createHash("sha256")
    .update(request.headers.get("authorization") || "")
    .digest();
  if (!timingSafeEqual(new Uint8Array(expected), new Uint8Array(actual)))
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  try {
    const [feed, history] = await Promise.all([
      readPublishedFeed("opportunites_actuelles.json", 2_000_000),
      readPublishedFeed("paris.json", 20_000_000),
    ]);
    return Response.json(await runPaperCycle(feed, history));
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    const exposed = [
      "database_not_configured",
      "paper_capacity_reached",
      "paper_policy_changed",
    ];
    return Response.json(
      {
        ok: false,
        error: exposed.includes(code) ? code : "paper_cycle_failed",
      },
      { status: 503 },
    );
  }
}
export const POST = GET;
