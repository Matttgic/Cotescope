import { ANJ_SPORTS_BOOKMAKERS, THE_ODDS_API_FR_BOOKMAKERS } from "@/lib/bookmakers";

export async function GET() {
  const mode = process.env.ODDS_PROVIDER || "demo";
  return Response.json({
    ok: true,
    service: "cotescope-fr",
    mode,
    providerConfigured: mode === "demo" || Boolean(process.env.THE_ODDS_API_KEY),
    anjAllowListDomains: ANJ_SPORTS_BOOKMAKERS.length,
    liveProviderFrenchBookmakers: Object.keys(THE_ODDS_API_FR_BOOKMAKERS).length,
    timestamp: new Date().toISOString()
  });
}
