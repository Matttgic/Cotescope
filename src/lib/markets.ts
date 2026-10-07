export type SettlementModel = "binary" | "refund" | "split";
export type MarketIdentity = {
  code: string;
  period: string;
  line: number | null;
  issue: string;
  label: string;
  settlement: SettlementModel;
};
const PERIODS = new Set([
  "MATCH",
  "MT1",
  "MT2",
  "TEMPS_REG",
  "P1",
  "P2",
  "P3",
  "QT1",
  "QT2",
  "QT3",
  "QT4",
  "SET1",
  "SET2",
  "SET3",
  "SET4",
  "SET5",
  "5_MANCHES",
  "JEUX",
]);
const LABELS: Record<string, string> = {
  RESULTAT_1N2: "Résultat · 1X2",
  VAINQUEUR: "Vainqueur",
  DRAW_NO_BET: "Nul remboursé",
  DOUBLE_CHANCE: "Double chance",
  HANDICAP: "Handicap asiatique",
  HANDICAP_3: "Handicap européen",
  TOTAL: "Total",
  TOTAL_DOM: "Total domicile",
  TOTAL_EXT: "Total extérieur",
  BOTH_TEAMS_TO_SCORE: "Les deux équipes marquent",
  CORRECT_SCORE: "Score exact",
  HALF_TIME_FULL_TIME: "Mi-temps / fin de match",
};
/** Only the engine's explicit canonical vocabulary; never guess ambiguous periods or lines. */
export function identifyMarket(
  row: Record<string, unknown>,
): MarketIdentity | null {
  const code = String(row.marche),
    period = String(row.periode),
    issue = String(row.issue);
  if (!PERIODS.has(period)) return null;
  const base = code.replace(/^(CORNERS|JEUX|SETS)_/, "");
  if (
    !Object.hasOwn(LABELS, base) ||
    (base !== code &&
      !["HANDICAP", "TOTAL", "TOTAL_DOM", "TOTAL_EXT"].includes(base))
  )
    return null;
  const lined = [
    "HANDICAP",
    "HANDICAP_3",
    "TOTAL",
    "TOTAL_DOM",
    "TOTAL_EXT",
  ].includes(base);
  const line = row.ligne === null || row.ligne === undefined ? null : row.ligne;
  if (
    lined &&
    (typeof line !== "number" ||
      !Number.isFinite(line) ||
      Math.abs(line * 4 - Math.round(line * 4)) > 1e-8)
  )
    return null;
  if (!lined && line !== null) return null;
  if (base === "HANDICAP_3" && !Number.isInteger(line)) return null;
  if (base.startsWith("TOTAL") && Number(line) < 0) return null;
  const allowed: Record<string, string[]> = {
    RESULTAT_1N2: ["DOM", "NUL", "EXT"],
    VAINQUEUR: ["DOM", "EXT"],
    DRAW_NO_BET: ["DOM", "EXT"],
    DOUBLE_CHANCE: ["HOME_DRAW", "HOME_AWAY", "DRAW_AWAY"],
    HANDICAP: ["DOM", "EXT"],
    HANDICAP_3: ["DOM", "NUL", "EXT"],
    BOTH_TEAMS_TO_SCORE: ["YES", "NO"],
    TOTAL: ["PLUS", "MOINS"],
    TOTAL_DOM: ["PLUS", "MOINS"],
    TOTAL_EXT: ["PLUS", "MOINS"],
  };
  if (allowed[base] && !allowed[base].includes(issue)) return null;
  if (base === "CORRECT_SCORE" && !/^\d{1,2}-\d{1,2}$/.test(issue)) return null;
  if (
    base === "HALF_TIME_FULL_TIME" &&
    !/^(DOM|NUL|EXT)\/(DOM|NUL|EXT)$/.test(issue)
  )
    return null;
  let settlement: SettlementModel =
    base === "DRAW_NO_BET" ? "refund" : "binary";
  if (lined && base !== "HANDICAP_3") {
    settlement = Number.isInteger(Number(line))
      ? "refund"
      : Number.isInteger(Number(line) * 2)
        ? "binary"
        : "split";
  }
  const prefix = code.startsWith("JEUX_")
    ? "Jeux · "
    : code.startsWith("SETS_")
      ? "Sets · "
      : code.startsWith("CORNERS_")
        ? "Corners · "
        : "";
  return {
    code,
    period,
    issue,
    line: line as number | null,
    settlement,
    label: `${prefix}${LABELS[base]}${line === null ? "" : ` ${line}`} · ${period}`,
  };
}
