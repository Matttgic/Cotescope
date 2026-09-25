export function impliedProbability(decimalOdds: number): number {
  return decimalOdds > 1 ? 1 / decimalOdds : 0;
}

export function fairOddsFromProbability(probability: number): number {
  return probability > 0 ? 1 / probability : 0;
}

export function expectedValuePct(decimalOdds: number, fairProbability: number): number {
  return (decimalOdds * fairProbability - 1) * 100;
}

export function noVigProbabilities(decimalOdds: number[]): number[] {
  const implied = decimalOdds.map(impliedProbability);
  const total = implied.reduce((sum, p) => sum + p, 0);
  if (total <= 0) return decimalOdds.map(() => 0);
  return implied.map((p) => p / total);
}

export function fractionalKelly(
  decimalOdds: number,
  fairProbability: number,
  fraction = 0.25,
  maxBankrollFraction = 0.02
): number {
  if (decimalOdds <= 1 || fairProbability <= 0 || fairProbability >= 1) return 0;
  const b = decimalOdds - 1;
  const q = 1 - fairProbability;
  const fullKelly = (b * fairProbability - q) / b;
  return Math.max(0, Math.min(fullKelly * fraction, maxBankrollFraction));
}

export function opportunityScore(input: {
  evPct: number;
  sharpQuality: number;
  freshness: number;
  stability: number;
  consensus: number;
  liquidity: number;
}): number {
  const evScore = Math.max(0, Math.min(input.evPct / 12, 1)) * 35;
  const score =
    evScore +
    input.sharpQuality * 20 +
    input.freshness * 15 +
    input.stability * 15 +
    input.consensus * 10 +
    input.liquidity * 5;
  return Math.round(Math.max(0, Math.min(score, 100)));
}

export function passesHighOddsGuard(odds: number, score: number, evPct: number): boolean {
  if (odds <= 4) return true;
  return score >= 85 && evPct >= 5 && odds <= 8;
}
