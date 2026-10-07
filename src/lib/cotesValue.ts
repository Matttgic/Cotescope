import { identifyMarket } from "./markets";
import type { Opportunity, Sport } from "./types";
import { evidenceScore, passesHighOddsGuard } from "./value";

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
};
const BOOKS = new Set(["Winamax", "Betclic", "Unibet", "PMU"]);
const REFERENCES = new Set([
  "Pinnacle",
  "Betfair",
  "Polymarket",
  "Kalshi",
  "Consensus",
]);
type Row = Record<string, unknown>;

/** Adapt the published engine's audited canonical markets; never blend demo or raw-margin control bets. */
export function adaptCotesValue(
  input: unknown,
  now = Date.now(),
): { opportunities: Opportunity[]; excluded: number } {
  if (!Array.isArray(input)) throw new Error("invalid_feed");
  const groups = new Map<string, Row[]>();
  let excluded = 0;
  for (const value of input) {
    if (!value || typeof value !== "object") {
      excluded++;
      continue;
    }
    const row = value as Row;
    const p = row.proba_juste,
      odds = row.cote;
    const market = identifyMarket(row);
    const quote = Date.parse(String(row.detecte)),
      reference = Date.parse(String(row.lu_reference)),
      start = Date.parse(String(row.debut));
    const control = row.controle as Row | undefined;
    if (
      row.suspect ||
      !REFERENCES.has(String(row.reference)) ||
      !BOOKS.has(String(row.bookmaker)) ||
      !market ||
      typeof row.match_id !== "string" ||
      !row.match_id ||
      typeof row.domicile !== "string" ||
      typeof row.exterieur !== "string" ||
      typeof p !== "number" ||
      typeof odds !== "number" ||
      control?.statut !== "conforme" ||
      !Number.isFinite(p) ||
      p <= 0 ||
      p >= 1 ||
      !Number.isFinite(odds) ||
      odds <= 1 ||
      !Number.isFinite(quote) ||
      !Number.isFinite(reference) ||
      quote > now + 60000 ||
      reference > now + 60000 ||
      now - Math.min(quote, reference) > 900000 ||
      !Number.isFinite(start) ||
      start <= now ||
      typeof row.pari !== "string" ||
      !row.pari
    ) {
      excluded++;
      continue;
    }
    const key = JSON.stringify([
      row.bookmaker,
      row.match_id,
      row.marche,
      row.periode,
      row.ligne,
      row.issue,
      row.joueur ?? null,
    ]);
    groups.set(key, [...(groups.get(key) || []), row]);
  }
  const opportunities: Opportunity[] = [];
  for (const [id, rows] of groups) {
    // Take the latest row for each reference, then choose consensus (not max EV).
    const byReference = new Map<string, Row>();
    for (const row of rows) {
      const name = String(row.reference),
        previous = byReference.get(name);
      if (
        !previous ||
        Date.parse(String(row.detecte)) > Date.parse(String(previous.detecte))
      )
        byReference.set(name, row);
    }
    const base =
      byReference.get("Consensus") ||
      byReference.get("Pinnacle") ||
      [...byReference.values()][0];
    if (!base) continue;
    const odds = Number(base.cote),
      probability = Number(base.proba_juste),
      ev = (odds * probability - 1) * 100;
    if (!Number.isFinite(ev) || ev <= 0 || ev > 25) {
      excluded += rows.length;
      continue;
    }
    const fair = 1 / probability;
    const refs = [...byReference.entries()]
      .filter(([name]) => name !== "Consensus")
      .map(([name, r]) => ({
        name,
        fairOdds: 1 / Number(r.proba_juste),
        observedAt: String(r.lu_reference),
      }));
    const components = base.composantes;
    const componentOdds =
      components && typeof components === "object"
        ? Object.values(components)
            .map(Number)
            .filter((v) => Number.isFinite(v) && v > 1)
        : refs.map((r) => r.fairOdds);
    if (
      componentOdds.length >= 2 &&
      Math.max(...componentOdds) / Math.min(...componentOdds) > 1.25
    ) {
      excluded += rows.length;
      continue;
    }
    const age = Math.max(
      0,
      (now -
        Math.min(
          Date.parse(String(base.detecte)),
          Date.parse(String(base.lu_reference)),
        )) /
        1000,
    );
    const consensus =
      base.reference === "Consensus" && componentOdds.length >= 2;
    const association =
      typeof base.score_association === "number" &&
      Number.isFinite(base.score_association)
        ? base.score_association
        : null;
    const market = identifyMarket(base)!;
    const control = base.controle as Row;
    const finite = (v: unknown) =>
      typeof v === "number" && Number.isFinite(v) ? v : null;
    const score = evidenceScore({
      evPct: ev,
      ageSeconds: age,
      marketVerified: true,
      consensus,
    });
    opportunities.push({
      id: `cv-${id}`,
      sport: SPORTS[String(base.sport)] || "Autre",
      competition: String(base.ligue || ""),
      event: `${base.domicile} — ${base.exterieur}`,
      startTime: String(base.debut),
      market: market.label,
      marketIdentity: market,
      evidence: {
        detectedAt: String(base.detecte),
        referenceReadAt: String(base.lu_reference),
        referenceEvent: String(base.match_reference || "Non conservé"),
        referenceId: String(base.match_id_reference || "Non conservé"),
        inverted:
          typeof base.reference_inversee === "boolean"
            ? base.reference_inversee
            : null,
        association,
        controlCount: finite(control.n),
        controlMedian: finite(control.mediane),
        components:
          components && typeof components === "object"
            ? Object.entries(components)
                .filter(
                  ([, v]) =>
                    typeof v === "number" && Number.isFinite(v) && v > 1,
                )
                .map(([name, v]) => ({ name, fairOdds: Number(v) }))
            : [],
      },
      selection: String(base.pari),
      bookmaker: String(base.bookmaker),
      bookmakerOdds: odds,
      referenceOdds: Number(base.cote_reference) || 0,
      fairOdds: fair,
      evPct: ev,
      opportunityScore: score,
      freshnessSeconds: Math.round(age),
      confidence: score >= 85 ? "Forte" : score >= 70 ? "Moyenne" : "Faible",
      highOddsGuard: passesHighOddsGuard(odds, score, ev),
      isBoost: false,
      reference: String(base.reference),
      observedAt: new Date(now - age * 1000).toISOString(),
      references: refs,
      qualityNote: `Marché conforme au contrôle cotes-value. ${consensus ? "Consensus prioritaire." : "Une référence sélectionnée, pas de consensus confirmé."} Score heuristique : EV (35), référence (20), fraîcheur (20), contrôle (20), consensus (5). Liquidité et stabilité non notées.${association !== null ? ` Association des noms : ${association}.` : ""}`,
    });
  }
  return { opportunities, excluded };
}
