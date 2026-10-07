import { adaptEngineHistory } from "@/lib/engineHistory";
import { readPublishedFeed } from "@/lib/publishedFeed";
export async function GET() {
  try {
    const data = adaptEngineHistory(
      await readPublishedFeed("paris.json", 20_000_000),
    );
    return Response.json({
      ...data,
      source: "cotes-value",
      demo: false,
      fetchedAt: new Date().toISOString(),
      scope: "Fichier actif paris.json · archives mensuelles exclues",
    });
  } catch {
    return Response.json(
      { error: "engine_history_unavailable", bets: [], demo: false },
      { status: 502 },
    );
  }
}
