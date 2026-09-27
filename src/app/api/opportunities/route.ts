import { fetchFrenchH2HOpportunities } from "@/lib/providers/theOddsApi";

export async function GET(request: Request) {
  const hasOddsKey = Boolean(process.env.THE_ODDS_API_KEY?.trim());
  const provider = process.env.ODDS_PROVIDER || (hasOddsKey ? "theoddsapi" : "demo");
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

  if (!hasOddsKey) {
    return Response.json({
      provider,
      demo: true,
      liveConfigured: false,
      error: "THE_ODDS_API_KEY is missing",
      generatedAt: new Date().toISOString(),
      quota: null,
      opportunities: []
    }, { status: 503 });
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
      provider,
      demo: true,
      liveConfigured: true,
      error: error instanceof Error ? error.message : "Unknown odds provider error",
      generatedAt: new Date().toISOString(),
      opportunities: []
    }, { status: 502 });
  }
}
