import { decideCoteScope } from "@/lib/decisionEngine";
import { readPublishedFeed } from "@/lib/publishedFeed";
export async function GET() {
  try {
    const data = decideCoteScope(
      await readPublishedFeed("opportunites_actuelles.json", 2_000_000),
    );
    return Response.json({
      ...data,
      demo: false,
      source: "cotescope",
      provider: "cotes-value",
      generatedAt: new Date().toISOString(),
      scope: "Décision CoteScope robuste · prix publiés par cotes-value",
      quota: null,
    });
  } catch {
    return Response.json(
      { error: "cotescope_source_unavailable", demo: false, opportunities: [] },
      { status: 502 },
    );
  }
}
