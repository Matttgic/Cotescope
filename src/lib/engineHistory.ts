import { identifyMarket, type MarketIdentity } from "./markets";
export const ENGINE_REFERENCES = [
  "Pinnacle",
  "Betfair",
  "Polymarket",
  "Kalshi",
  "Consensus",
  "Pinnacle brut",
];
export const ENGINE_STATUSES: Record<string, string> = {
  en_cours: "Ouvert",
  a_regler: "À régler",
  gagne: "Gagné",
  perdu: "Perdu",
  demi_gagne: "Demi-gagné",
  demi_perdu: "Demi-perdu",
  rembourse: "Remboursé",
};
type Row = Record<string, unknown>;
export type EngineBet = {
  id: string;
  key: string;
  reference: string;
  simulation: string;
  detectedAt: string;
  startTime: string;
  sport: string;
  competition: string;
  event: string;
  selection: string;
  bookmaker: string;
  market: MarketIdentity;
  odds: number;
  stake: number;
  evPct: number;
  status: string;
  profit: number | null;
  reportedProfit: number | null;
  profitVerified: boolean;
  closingOdds: number | null;
  closingReadAt: string | null;
  clvPct: number | null;
  clvReason: string;
  referenceReadAt: string | null;
  referenceEvent: string | null;
  takenProof: Row | null;
  settlementProof: Row | null;
};
const finite = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
const text = (v: unknown) => (typeof v === "string" && v.length > 0 ? v : null);
const object = (v: unknown): Row | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Row) : null;
export function zonedTime(v: unknown): number {
  return typeof v === "string" && /(Z|[+-]\d{2}:\d{2})$/.test(v)
    ? Date.parse(v)
    : NaN;
}
export function engineProfit(
  status: string,
  stake: number,
  odds: number,
): number | null {
  if (status === "gagne") return stake * (odds - 1);
  if (status === "demi_gagne") return (stake * (odds - 1)) / 2;
  if (status === "perdu") return -stake;
  if (status === "demi_perdu") return -stake / 2;
  if (status === "rembourse") return 0;
  return null;
}
export function closingValue(
  row: Row,
  now = Date.now(),
): { clvPct: number | null; clvReason: string } {
  const missing = (clvReason: string) => ({ clvPct: null, clvReason });
  if (
    !["gagne", "perdu", "demi_gagne", "demi_perdu", "rembourse"].includes(
      String(row.statut),
    )
  )
    return missing("Pari non réglé");
  const start = zonedTime(row.debut),
    close = zonedTime(row.cloture_lue);
  if (!Number.isFinite(start) || !Number.isFinite(close))
    return missing("Horodatage de clôture absent ou sans fuseau");
  if (start > now || close >= start || start - close > 30 * 60000)
    return missing("Relevé hors des 30 minutes avant le début");
  if (
    !finite(row.cote_juste_cloture) ||
    row.cote_juste_cloture <= 1 ||
    !finite(row.cote) ||
    row.cote <= 1 ||
    !finite(row.clv)
  )
    return missing("Prix ou CLV de clôture absent");
  const clv = row.cote / row.cote_juste_cloture - 1;
  if (Math.abs(clv - row.clv) > 0.001)
    return missing("CLV publiée incohérente avec les prix");
  return { clvPct: clv * 100, clvReason: "Prix et horodatage vérifiés" };
}
export function adaptEngineHistory(
  input: unknown,
  now = Date.now(),
): { bets: EngineBet[]; excluded: number } {
  if (!Array.isArray(input)) throw new Error("invalid_history");
  const bets: EngineBet[] = [],
    ids = new Set<string>();
  let excluded = 0;
  for (const value of input) {
    const r = object(value),
      market = r && identifyMarket(r);
    if (
      !r ||
      !market ||
      !text(r.id) ||
      !text(r.match_id) ||
      ids.has(String(r.id)) ||
      !ENGINE_REFERENCES.includes(String(r.reference)) ||
      !Object.hasOwn(ENGINE_STATUSES, String(r.statut)) ||
      !finite(r.cote) ||
      r.cote <= 1 ||
      !finite(r.mise) ||
      r.mise <= 0 ||
      !finite(r.ecart) ||
      !Number.isFinite(zonedTime(r.detecte)) ||
      zonedTime(r.detecte) > now + 60000 ||
      !Number.isFinite(zonedTime(r.debut)) ||
      !text(r.bookmaker) ||
      !text(r.domicile) ||
      !text(r.exterieur) ||
      !text(r.pari) ||
      !/^[ABCDEX]$/.test(String(r.simulation))
    ) {
      excluded++;
      continue;
    }
    ids.add(String(r.id));
    const profit = engineProfit(String(r.statut), r.mise, r.cote);
    const verified =
      profit !== null &&
      finite(r.gain) &&
      Math.abs(profit - r.gain) <= 0.02 &&
      zonedTime(r.debut) <= now;
    bets.push({
      id: String(r.id),
      key: JSON.stringify([
        r.bookmaker,
        r.match_id,
        r.marche,
        r.periode,
        r.ligne ?? null,
        r.issue,
        r.joueur ?? null,
      ]),
      reference: String(r.reference),
      simulation: String(r.simulation),
      detectedAt: String(r.detecte),
      startTime: String(r.debut),
      sport: String(r.sport || "Autre"),
      competition: String(r.ligue || ""),
      event: `${r.domicile} — ${r.exterieur}`,
      selection: String(r.pari),
      bookmaker: String(r.bookmaker),
      market,
      odds: r.cote,
      stake: r.mise,
      evPct: r.ecart * 100,
      status: String(r.statut),
      profit,
      reportedProfit: finite(r.gain) ? r.gain : null,
      profitVerified: verified,
      closingOdds:
        finite(r.cote_juste_cloture) && r.cote_juste_cloture > 1
          ? r.cote_juste_cloture
          : null,
      closingReadAt: text(r.cloture_lue),
      ...closingValue(r, now),
      referenceReadAt: text(r.lu_reference),
      referenceEvent: text(r.match_reference),
      takenProof: object(r.preuve_prise),
      settlementProof: object(r.preuve_reglement),
    });
  }
  return { bets, excluded };
}
/** Choose the first detection BEFORE filters; exclude the raw-margin control from unique bets. */
export function uniqueEngineBets(bets: EngineBet[]): EngineBet[] {
  const first = new Map<string, EngineBet>();
  for (const b of bets) {
    if (b.reference === "Pinnacle brut") continue;
    const prev = first.get(b.key),
      delta = prev
        ? Date.parse(b.detectedAt) - Date.parse(prev.detectedAt)
        : -1;
    if (
      !prev ||
      delta < 0 ||
      (delta === 0 &&
        ENGINE_REFERENCES.indexOf(b.reference) <
          ENGINE_REFERENCES.indexOf(prev.reference))
    )
      first.set(b.key, b);
  }
  return [...first.values()];
}
export type EngineFilters = {
  reference: string;
  simulation: string;
  sport: string;
  bookmaker: string;
  market: string;
  status: string;
  search: string;
};
export const ENGINE_FILTERS: EngineFilters = {
  reference: "Uniques",
  simulation: "Tous",
  sport: "Tous",
  bookmaker: "Tous",
  market: "Tous",
  status: "Tous",
  search: "",
};
export function filterEngineBets(
  bets: EngineBet[],
  f: EngineFilters,
): EngineBet[] {
  const selected =
    f.reference === "Uniques"
      ? uniqueEngineBets(bets)
      : bets.filter((b) => b.reference === f.reference);
  return selected
    .filter(
      (b) =>
        (f.simulation === "Tous" || b.simulation === f.simulation) &&
        (f.sport === "Tous" || b.sport === f.sport) &&
        (f.bookmaker === "Tous" || b.bookmaker === f.bookmaker) &&
        (f.market === "Tous" || b.market.code === f.market) &&
        (f.status === "Tous" || b.status === f.status) &&
        `${b.event} ${b.selection} ${b.competition}`
          .toLocaleLowerCase("fr")
          .includes(f.search.toLocaleLowerCase("fr")),
    )
    .sort(
      (a, b) =>
        Date.parse(b.detectedAt) - Date.parse(a.detectedAt) ||
        a.id.localeCompare(b.id),
    );
}
export function engineStats(bets: EngineBet[]) {
  const closed = bets.filter((b) => b.profit !== null),
    verified = closed.filter((b) => b.profitVerified);
  const stakes = verified.reduce((s, b) => s + b.stake, 0),
    net = verified.reduce((s, b) => s + b.profit!, 0);
  const clv = closed.filter((b) => b.clvPct !== null);
  return {
    total: bets.length,
    closed: closed.length,
    verified: verified.length,
    conflicts: closed.length - verified.length,
    stakes,
    net,
    roi: stakes ? (net / stakes) * 100 : null,
    clvCount: clv.length,
    clvPct: clv.length
      ? clv.reduce((s, b) => s + b.clvPct!, 0) / clv.length
      : null,
    exposure: bets
      .filter((b) => b.profit === null)
      .reduce((s, b) => s + b.stake, 0),
    missingSettlementProof: closed.filter((b) => !b.settlementProof).length,
  };
}
