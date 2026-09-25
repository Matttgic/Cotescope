import { DEMO_ARBITRAGES } from "@/data/demo";
import { arbitrageRoiPct } from "@/lib/arbitrage";

export async function GET() {
  return Response.json({
    demo: true,
    generatedAt: new Date().toISOString(),
    arbitrages: DEMO_ARBITRAGES.map((arb) => ({
      ...arb,
      roiPct: arbitrageRoiPct(arb.outcomes.map((o) => o.odds))
    }))
  });
}
