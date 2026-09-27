import "server-only";

export const MONTHLY_AUTOMATION_HARD_CAP = 4_500;
export const MONTHLY_ODDS_SCAN_CAP = 4_000;
export const RESULT_CREDIT_RESERVE = MONTHLY_AUTOMATION_HARD_CAP - MONTHLY_ODDS_SCAN_CAP;

export function canSpendOddsCredits(used: number | null | undefined, estimatedCost = 1) {
  if (used == null || !Number.isFinite(used)) return true;
  return used + estimatedCost <= MONTHLY_ODDS_SCAN_CAP;
}

export function canSpendAutomationCredits(used: number | null | undefined, estimatedCost = 1) {
  if (used == null || !Number.isFinite(used)) return true;
  return used + estimatedCost <= MONTHLY_AUTOMATION_HARD_CAP;
}

export function automationBudgetRatio(used: number | null | undefined) {
  if (used == null || !Number.isFinite(used) || used <= 0) return 0;
  return Math.min(1, used / MONTHLY_AUTOMATION_HARD_CAP);
}
