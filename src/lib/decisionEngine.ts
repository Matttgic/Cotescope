import { identifyMarket } from "./markets";
import type { Opportunity, Sport } from "./types";
import { fractionalKelly, passesHighOddsGuard } from "./value";

export const METHOD_VERSION = "robust-v1";
export const BALANCED_METHOD_VERSION = "balanced-v1";
// Fixed stress policy. These constants are not fitted on reported profits.
export const DECISION_POLICY = Object.freeze({
  minEdgePct: 2,
  maxAgeSeconds: 900,
  soloMaxAgeSeconds: 180,
  maxTimeSkewSeconds: 120,
  minAssociation: 0.9,
  soloMinAssociation: 0.95,
  baseProbabilityBuffer: 0.004,
  soloProbabilityBuffer: 0.006,
  ageProbabilityBuffer: 0.004,
  maxProbabilitySpread: 0.06,
  maxOdds: 6,
  maxStakeFraction: 0.01,
});
export const BALANCED_POLICY = Object.freeze({
  ...DECISION_POLICY,
  baseProbabilityBuffer: 0.002,
  soloProbabilityBuffer: 0.003,
  ageProbabilityBuffer: 0.002,
});
export type DecisionProfile = "prudent" | "balanced";
export type DecisionEvidence = {
  version: typeof METHOD_VERSION | typeof BALANCED_METHOD_VERSION;
  centralProbability: number;
  conservativeProbability: number;
  probabilityBuffer: number;
  referenceCount: number;
  dispersion: number;
  nominalEdgePct: number;
  conservativeEdgePct: number;
  stakeFraction: number;
  eventKey: string;
};
export const REJECTION_LABELS: Record<string, string> = {
  invalid: "Données ou marché incomplets",
  stale: "Prix ancien, futur ou désynchronisé",
  identity: "Correspondance du match insuffisante",
  settlement: "Probabilités de remboursement manquantes",
  reference: "Référence unitaire horodatée insuffisante",
  disagreement: "Références trop éloignées",
  edge: "Avantage prudent insuffisant",
  highOdds: "Grosse cote insuffisamment corroborée",
  exposure: "Une sélection mieux classée sur ce match",
};
export type DecisionDiagnostics = {
  version: DecisionEvidence["version"];
  inputRows: number;
  invalidRows: number;
  candidates: number;
  selected: number;
  rejected: Record<string, number>;
};
type Row = Record<string, unknown>;
const SOURCES: Record<string, number> = {
  Pinnacle: 1,
  Betfair: 0.85,
  Polymarket: 0.5,
  Kalshi: 0.5,
};
const SPORTS: Record<string, Sport> = {
  football: "Football",
  tennis: "Tennis",
  basket: "Basketball",
  rugby: "Rugby",
  handball: "Handball",
  volley: "Volleyball",
  hockey: "Hockey",
  baseball: "Baseball",
  football_americain: "NFL",
  mma: "MMA",
  boxe: "Boxe",
};
const BOOKS = new Set(["Winamax", "Betclic", "Unibet", "PMU"]);
const finite = (x: unknown): x is number =>
  typeof x === "number" && Number.isFinite(x);
const text = (x: unknown): x is string =>
  typeof x === "string" && x.trim().length > 0;
const stamp = (x: unknown) =>
  typeof x === "string" && /(Z|[+-]\d{2}:\d{2})$/.test(x) ? Date.parse(x) : NaN;
const normalize = (x: unknown) =>
  String(x ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
export function candidateKey(r: Row): string {
  return JSON.stringify([
    r.bookmaker,
    r.match_id,
    r.marche,
    r.periode,
    r.ligne ?? null,
    r.issue,
    r.joueur ?? null,
  ]);
}
export function eventKey(r: Row): string {
  return JSON.stringify([
    r.sport,
    normalize(r.domicile),
    normalize(r.exterieur),
    stamp(r.debut),
  ]);
}
function median(values: Array<{ p: number; weight: number }>): number {
  const sorted = [...values].sort((a, b) => a.p - b.p);
  const total = sorted.reduce((sum, x) => sum + x.weight, 0);
  let cumulative = 0;
  for (const [i, value] of sorted.entries()) {
    cumulative += value.weight;
    if (Math.abs(cumulative - total / 2) < 1e-12 && sorted[i + 1])
      return (value.p + sorted[i + 1].p) / 2;
    if (cumulative >= total / 2) return value.p;
  }
  return sorted.at(-1)!.p;
}

/** Independent selection policy. No result, closing price, upstream EV or Consensus is read. */
export function decideCoteScope(
  input: unknown,
  now = Date.now(),
  profile: DecisionProfile = "prudent",
): { opportunities: Opportunity[]; diagnostics: DecisionDiagnostics } {
  if (profile !== "prudent" && profile !== "balanced")
    throw new Error("invalid_decision_profile");
  const policy = profile === "balanced" ? BALANCED_POLICY : DECISION_POLICY;
  const version =
    profile === "balanced" ? BALANCED_METHOD_VERSION : METHOD_VERSION;
  if (!Array.isArray(input) || !Number.isFinite(now))
    throw new Error("invalid_feed");
  const diagnostics: DecisionDiagnostics = {
    version,
    inputRows: input.length,
    invalidRows: 0,
    candidates: 0,
    selected: 0,
    rejected: {},
  };
  const reject = (reason: string) => {
    diagnostics.rejected[reason] = (diagnostics.rejected[reason] || 0) + 1;
  };
  const groups = new Map<string, Row[]>();
  for (const value of input) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      diagnostics.invalidRows++;
      continue;
    }
    const r = value as Row;
    if (
      !text(r.match_id) ||
      !text(r.domicile) ||
      !text(r.exterieur) ||
      !BOOKS.has(String(r.bookmaker)) ||
      !identifyMarket(r)
    ) {
      diagnostics.invalidRows++;
      continue;
    }
    const key = candidateKey(r);
    groups.set(key, [...(groups.get(key) || []), r]);
  }
  diagnostics.candidates = groups.size;
  const candidates: Opportunity[] = [];
  for (const [key, rows] of groups) {
    // Use the latest available bookmaker quote; never rescue it using an older, higher price.
    const latest = [...rows]
      .filter((r) => Number.isFinite(stamp(r.detecte)))
      .sort((a, b) => stamp(b.detecte) - stamp(a.detecte))[0];
    if (
      !latest ||
      !finite(latest.cote) ||
      latest.cote <= 1 ||
      !text(latest.pari) ||
      !Number.isFinite(stamp(latest.debut))
    ) {
      reject("invalid");
      continue;
    }
    const quoteTime = stamp(latest.detecte),
      start = stamp(latest.debut),
      odds = latest.cote;
    if (
      start <= now ||
      quoteTime > now + 60000 ||
      now - quoteTime > policy.maxAgeSeconds * 1000
    ) {
      reject("stale");
      continue;
    }
    const market = identifyMarket(latest)!;
    if (market.settlement !== "binary") {
      reject("settlement");
      continue;
    }
    const references = new Map<string, Row>();
    let identityFailure = false,
      staleFailure = false;
    for (const r of rows) {
      const source = String(r.reference);
      // Aggregates and untimed component estimates never count as separate references.
      if (
        !Object.hasOwn(SOURCES, source) ||
        r.suspect ||
        (r.controle as Row | undefined)?.statut !== "conforme" ||
        !finite(r.proba_juste) ||
        r.proba_juste <= 0 ||
        r.proba_juste >= 1
      )
        continue;
      if (
        !text(r.match_id_reference) ||
        !text(r.match_reference) ||
        !finite(r.score_association) ||
        r.score_association < policy.minAssociation ||
        stamp(r.debut) !== start
      ) {
        identityFailure = true;
        continue;
      }
      const readTime = stamp(r.lu_reference),
        detected = stamp(r.detecte);
      if (
        !Number.isFinite(readTime) ||
        Math.abs(detected - quoteTime) > 2000 ||
        r.cote !== odds ||
        readTime > now + 60000 ||
        Math.abs(readTime - quoteTime) > policy.maxTimeSkewSeconds * 1000 ||
        now - readTime > policy.maxAgeSeconds * 1000
      ) {
        staleFailure = true;
        continue;
      }
      const previous = references.get(source);
      if (!previous || readTime > stamp(previous.lu_reference))
        references.set(source, r);
    }
    if (!references.size) {
      reject(
        identityFailure ? "identity" : staleFailure ? "stale" : "reference",
      );
      continue;
    }
    const refs = [...references.entries()];
    const oldest = Math.min(
      quoteTime,
      ...refs.map(([, r]) => stamp(r.lu_reference)),
    );
    const age = Math.max(0, (now - oldest) / 1000),
      solo = refs.length === 1;
    if (
      solo &&
      (!references.has("Pinnacle") ||
        Number(refs[0][1].score_association) < policy.soloMinAssociation)
    ) {
      reject("reference");
      continue;
    }
    if (solo && age > policy.soloMaxAgeSeconds) {
      reject("stale");
      continue;
    }
    const probabilities = refs.map(([name, r]) => ({
      p: Number(r.proba_juste),
      weight: SOURCES[name],
    }));
    const min = Math.min(...probabilities.map((x) => x.p)),
      max = Math.max(...probabilities.map((x) => x.p));
    const dispersion = max - min;
    if (
      dispersion > policy.maxProbabilitySpread + 1e-12 ||
      max / min > 1.25 + 1e-12
    ) {
      reject("disagreement");
      continue;
    }
    const centralProbability = median(probabilities);
    const probabilityBuffer =
      policy.baseProbabilityBuffer +
      dispersion / 2 +
      (solo ? policy.soloProbabilityBuffer : 0) +
      (policy.ageProbabilityBuffer * age) / policy.maxAgeSeconds;
    const conservativeProbability = Math.max(
      0,
      centralProbability - probabilityBuffer,
    );
    const edge = (odds * conservativeProbability - 1) * 100;
    if (edge < policy.minEdgePct || edge > 25) {
      reject("edge");
      continue;
    }
    const score = Math.round(
      Math.min(
        95,
        65 +
          Math.min(edge / 8, 1) * 15 +
          (solo ? 0 : 10) +
          (1 - age / 900) * 10,
      ),
    );
    if (
      odds > policy.maxOdds ||
      (odds > 4 &&
        (solo || edge < 5 || !passesHighOddsGuard(odds, score, edge)))
    ) {
      reject("highOdds");
      continue;
    }
    const base = references.get("Pinnacle") || refs[0][1];
    const method: DecisionEvidence = {
      version,
      centralProbability,
      conservativeProbability,
      probabilityBuffer,
      referenceCount: refs.length,
      dispersion,
      nominalEdgePct: (odds * centralProbability - 1) * 100,
      conservativeEdgePct: edge,
      stakeFraction: fractionalKelly(
        odds,
        conservativeProbability,
        0.25,
        policy.maxStakeFraction,
      ),
      eventKey: eventKey(latest),
    };
    candidates.push({
      id: `cs-${key}`,
      sport: SPORTS[String(latest.sport)] || "Autre",
      competition: String(latest.ligue || ""),
      event: `${latest.domicile} — ${latest.exterieur}`,
      startTime: String(latest.debut),
      market: market.label,
      marketIdentity: market,
      selection: String(latest.pari),
      bookmaker: String(latest.bookmaker),
      bookmakerOdds: odds,
      referenceOdds: finite(base.cote_reference) ? base.cote_reference : 0,
      fairOdds: 1 / conservativeProbability,
      evPct: edge,
      opportunityScore: score,
      freshnessSeconds: Math.ceil(age),
      confidence: score >= 85 ? "Forte" : "Moyenne",
      highOddsGuard: passesHighOddsGuard(odds, score, edge),
      isBoost: false,
      reference:
        profile === "balanced" ? "CoteScope équilibré" : "CoteScope robuste",
      observedAt: new Date(oldest).toISOString(),
      references: refs.map(([name, r]) => ({
        name,
        fairOdds: 1 / Number(r.proba_juste),
        observedAt: String(r.lu_reference),
      })),
      method,
      evidence: {
        detectedAt: String(latest.detecte),
        referenceReadAt: new Date(oldest).toISOString(),
        referenceEvent: String(base.match_reference),
        referenceId: String(base.match_id_reference),
        inverted:
          typeof base.reference_inversee === "boolean"
            ? base.reference_inversee
            : null,
        association: Number(base.score_association),
        controlCount: finite((base.controle as Row).n)
          ? ((base.controle as Row).n as number)
          : null,
        controlMedian: finite((base.controle as Row).mediane)
          ? ((base.controle as Row).mediane as number)
          : null,
        components: refs.map(([name, r]) => ({
          name,
          fairOdds: 1 / Number(r.proba_juste),
        })),
      },
      qualityNote: `CoteScope ${version} : médiane pondérée de ${refs.length} référence(s) unitaire(s), puis retrait de ${(probabilityBuffer * 100).toFixed(2)} points de probabilité pour tester l'incertitude. Avantage prudent ${edge.toFixed(2)} %. Une sélection par match reconnu ; quart de Kelly plafonné à 1 %. Politique heuristique, sans intervalle de confiance statistique. Prix issus de cotes-value ; couverture présélectionnée.`,
    });
  }
  // Deterministic best candidate per identified event; avoid stacking related markets and books.
  const seen = new Set<string>();
  const opportunities = candidates
    .sort(
      (a, b) =>
        b.evPct - a.evPct ||
        b.opportunityScore - a.opportunityScore ||
        a.id.localeCompare(b.id),
    )
    .filter((item) => {
      const key = item.method!.eventKey;
      if (seen.has(key)) {
        reject("exposure");
        return false;
      }
      seen.add(key);
      return true;
    });
  diagnostics.selected = opportunities.length;
  return { opportunities, diagnostics };
}
