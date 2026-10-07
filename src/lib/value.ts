export function impliedProbability(decimalOdds: number): number {
  return Number.isFinite(decimalOdds) && decimalOdds > 1 ? 1 / decimalOdds : 0;
}

export function fairOddsFromProbability(probability: number): number {
  return Number.isFinite(probability) && probability > 0 && probability <= 1
    ? 1 / probability
    : 0;
}

export function expectedValuePct(
  decimalOdds: number,
  fairProbability: number,
): number {
  return (decimalOdds * fairProbability - 1) * 100;
}

export function noVigProbabilities(decimalOdds: number[]): number[] {
  if (
    decimalOdds.length < 2 ||
    decimalOdds.some((o) => !Number.isFinite(o) || o <= 1)
  )
    return decimalOdds.map(() => 0);
  const implied = decimalOdds.map(impliedProbability);
  const total = implied.reduce((sum, p) => sum + p, 0);
  if (total <= 1) return implied.map((p) => p / total);
  // Power method: solve sum((1 / odds)^k) = 1. A bounded binary
  // search avoids unstable Newton steps on heavily skewed markets.
  let low = 1,
    high = 2;
  const sum = (k: number) => implied.reduce((s, p) => s + p ** k, 0);
  while (sum(high) > 1 && high < 1024) high *= 2;
  for (let i = 0; i < 80; i++) {
    const middle = (low + high) / 2;
    if (sum(middle) > 1) low = middle;
    else high = middle;
  }
  const probabilities = implied.map((p) => p ** ((low + high) / 2));
  const norm = probabilities.reduce((s, p) => s + p, 0);
  return probabilities.map((p) => p / norm);
}

export function fractionalKelly(
  decimalOdds: number,
  fairProbability: number,
  fraction = 0.25,
  maxBankrollFraction = 0.02,
): number {
  if (
    ![decimalOdds, fairProbability, fraction, maxBankrollFraction].every(
      Number.isFinite,
    ) ||
    decimalOdds <= 1 ||
    fairProbability <= 0 ||
    fairProbability >= 1 ||
    fraction <= 0 ||
    maxBankrollFraction <= 0
  )
    return 0;
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

export function passesHighOddsGuard(
  odds: number,
  score: number,
  evPct: number,
): boolean {
  if (![odds, score, evPct].every(Number.isFinite) || odds <= 1 || evPct <= 0)
    return false;
  if (odds <= 4) return true;
  return score >= 85 && evPct >= 5 && odds <= 8;
}

/** A transparent heuristic from observed evidence, never an estimated win rate. */
export function evidenceScore(input: {
  evPct: number;
  ageSeconds: number;
  marketVerified: boolean;
  consensus: boolean;
}): number {
  if (
    ![input.evPct, input.ageSeconds].every(Number.isFinite) ||
    input.evPct <= 0 ||
    input.ageSeconds < 0
  )
    return 0;
  return Math.round(
    Math.min(
      100,
      Math.min(input.evPct / 12, 1) * 35 +
        20 + // Recognized reference, not a claim that its prices are correct.
        Math.max(0, 1 - input.ageSeconds / 900) * 20 +
        (input.marketVerified ? 20 : 0) +
        (input.consensus ? 5 : 0),
    ),
  );
}
