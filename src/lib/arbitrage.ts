export function arbitrageMargin(odds: number[]): number {
  if (odds.length < 2 || odds.some((o) => o <= 1)) return 1;
  return odds.reduce((sum, o) => sum + 1 / o, 0);
}

export function arbitrageRoiPct(odds: number[]): number {
  const margin = arbitrageMargin(odds);
  return margin > 0 && margin < 1 ? (1 / margin - 1) * 100 : 0;
}

export function arbitrageStakes(odds: number[], totalStake: number): number[] {
  const margin = arbitrageMargin(odds);
  if (margin <= 0 || margin >= 1 || totalStake <= 0) return odds.map(() => 0);
  return odds.map((o) => Number(((totalStake / o) / margin).toFixed(2)));
}
