import { fetchFrenchH2HOpportunities } from "@/lib/providers/theOddsApi";

export async function GET(request: Request) {
  const provider = process.env.ODDS_PROVIDER || "demo";
  const { searchParams } = new URL(request.url);
  const sportKey = searchParams.get("sportKey") || "upcoming";

  if (provider === "demo") {
    return Response.json({
      provider,
      demo: true,
      liveConfigured: false,
      generatedAt: new Date().toISOString(),
      quota: null,
      opportunities: []
    });
  }

  if (provider !== "theoddsapi") {
    return Response.json({ error: `Unsupported ODDS_PROVIDER: ${provider}` }, { status: 500 });
  }

  try {
    const result = await fetchFrenchH2HOpportunities(sportKey);
    return Response.json({
      provider,
      demo: false,
      liveConfigured: true,
      generatedAt: new Date().toISOString(),
      ...result
    });
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : "Unknown odds provider error"
    }, { status: 502 });
  }
}
