import type { MarketIdentity } from "./markets";
export type Sport =
  | "Football"
  | "Tennis"
  | "Basketball"
  | "Rugby"
  | "Handball"
  | "Volleyball"
  | "Hockey"
  | "Baseball"
  | "NFL"
  | "MMA"
  | "Boxe"
  | "Cricket"
  | "Darts"
  | "Tennis de table"
  | "Autre";

export type Opportunity = {
  id: string;
  sport: Sport;
  competition: string;
  event: string;
  startTime: string;
  market: string;
  selection: string;
  bookmaker: string;
  bookmakerOdds: number;
  referenceOdds: number;
  fairOdds: number;
  evPct: number;
  opportunityScore: number;
  freshnessSeconds: number;
  confidence: "Forte" | "Moyenne" | "Faible";
  highOddsGuard: boolean;
  isBoost: boolean;
  marketIdentity?: MarketIdentity;
  evidence?: {
    detectedAt: string;
    referenceReadAt: string;
    referenceEvent: string;
    referenceId: string;
    inverted: boolean | null;
    association: number | null;
    controlCount: number | null;
    controlMedian: number | null;
    components: Array<{ name: string; fairOdds: number }>;
  };
  reference?: string;
  observedAt?: string;
  qualityNote?: string;
  references?: Array<{ name: string; fairOdds: number; observedAt: string }>;
};
