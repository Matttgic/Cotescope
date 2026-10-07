import {
  ANJ_SPORTS_BOOKMAKERS,
  THE_ODDS_API_FR_BOOKMAKERS,
} from "@/lib/bookmakers";
import { defaultDataSource } from "@/lib/dataSource";

export async function GET() {
  const mode = defaultDataSource(process.env.DEFAULT_DATA_SOURCE);
  return Response.json({
    ok: true,
    service: "cotescope-fr",
    mode,
    providerConfigured:
      mode !== "live" || Boolean(process.env.THE_ODDS_API_KEY),
    anjAllowListDomains: ANJ_SPORTS_BOOKMAKERS.length,
    liveProviderFrenchBookmakers: Object.keys(THE_ODDS_API_FR_BOOKMAKERS)
      .length,
    timestamp: new Date().toISOString(),
  });
}
