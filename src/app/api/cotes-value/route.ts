import { adaptCotesValue } from "@/lib/cotesValue";
import { readPublishedFeed } from "@/lib/publishedFeed";

export async function GET() {
  try {
    const data = adaptCotesValue(
      await readPublishedFeed("opportunites_actuelles.json", 2_000_000),
    );
    return Response.json({
      ...data,
      demo: false,
      source: "cotes-value",
      provider: "cotes-value",
      generatedAt: new Date().toISOString(),
      scope:
        "Marchés canoniques contrôlés · identité exacte, période et ligne conservées",
      quota: null,
    });
  } catch {
    return Response.json(
      { error: "cotes_value_unavailable", demo: false, opportunities: [] },
      { status: 502 },
    );
  }
}
