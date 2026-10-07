import type { Opportunity } from "./types";
import { identifyMarket, type MarketIdentity } from "./markets";
import type { DecisionEvidence } from "./decisionEngine";
export type BetCapture = {
  version: 1;
  capturedAt: string;
  startTime: string;
  observedAt: string | null;
  bookmakerOdds: number;
  fairOdds: number;
  evPct: number;
  reference: string;
  marketIdentity?: MarketIdentity;
  evidence?: Opportunity["evidence"];
  references: NonNullable<Opportunity["references"]>;
  method?: DecisionEvidence;
};
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const finite = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
const date = (v: unknown): v is string =>
  typeof v === "string" && Number.isFinite(Date.parse(v));
const text = (v: unknown, max = 240): v is string =>
  typeof v === "string" && v.length <= max;
const nullableNumber = (v: unknown) => v === null || finite(v);
/** Sanitize a bounded, immutable price capture; old bets without a capture remain compatible. */
export function normalizeCapture(input: unknown): BetCapture | null {
  if (!object(input)) return null;
  try {
    if (JSON.stringify(input).length > 16000) return null;
  } catch {
    return null;
  }
  const c = input;
  if (
    c.version !== 1 ||
    !date(c.capturedAt) ||
    !date(c.startTime) ||
    (c.observedAt !== null && !date(c.observedAt)) ||
    !finite(c.bookmakerOdds) ||
    c.bookmakerOdds <= 1 ||
    !finite(c.fairOdds) ||
    c.fairOdds <= 1 ||
    !finite(c.evPct) ||
    Math.abs((c.bookmakerOdds / c.fairOdds - 1) * 100 - c.evPct) > 0.1 ||
    !text(c.reference, 80) ||
    !Array.isArray(c.references) ||
    c.references.length > 20
  )
    return null;
  const references: BetCapture["references"] = [];
  for (const r of c.references) {
    if (
      !object(r) ||
      !text(r.name, 80) ||
      !finite(r.fairOdds) ||
      r.fairOdds <= 1 ||
      !date(r.observedAt)
    )
      return null;
    references.push({
      name: r.name,
      fairOdds: r.fairOdds,
      observedAt: r.observedAt,
    });
  }
  let marketIdentity: MarketIdentity | undefined;
  let method: DecisionEvidence | undefined;
  if (c.method !== undefined) {
    const m = c.method;
    if (
      !object(m) ||
      m.version !== "robust-v1" ||
      !finite(m.centralProbability) ||
      !finite(m.conservativeProbability) ||
      m.centralProbability <= 0 ||
      m.centralProbability >= 1 ||
      m.conservativeProbability <= 0 ||
      m.conservativeProbability > m.centralProbability ||
      !finite(m.probabilityBuffer) ||
      Math.abs(
        m.centralProbability - m.conservativeProbability - m.probabilityBuffer,
      ) > 1e-8 ||
      !finite(m.dispersion) ||
      m.dispersion < 0 ||
      m.dispersion > 1 ||
      !finite(m.referenceCount) ||
      !Number.isInteger(m.referenceCount) ||
      m.referenceCount < 1 ||
      m.referenceCount > 4 ||
      !finite(m.nominalEdgePct) ||
      Math.abs(
        (c.bookmakerOdds * m.centralProbability - 1) * 100 - m.nominalEdgePct,
      ) > 0.1 ||
      !finite(m.conservativeEdgePct) ||
      Math.abs(m.conservativeEdgePct - c.evPct) > 0.1 ||
      Math.abs(1 / c.fairOdds - m.conservativeProbability) > 1e-8 ||
      !finite(m.stakeFraction) ||
      m.stakeFraction < 0 ||
      m.stakeFraction > 0.01 ||
      !text(m.eventKey, 1000)
    )
      return null;
    method = {
      version: "robust-v1",
      centralProbability: m.centralProbability,
      conservativeProbability: m.conservativeProbability,
      probabilityBuffer: m.probabilityBuffer,
      referenceCount: m.referenceCount,
      dispersion: m.dispersion,
      nominalEdgePct: m.nominalEdgePct,
      conservativeEdgePct: m.conservativeEdgePct,
      stakeFraction: m.stakeFraction,
      eventKey: m.eventKey,
    };
  }
  if (c.marketIdentity !== undefined) {
    if (!object(c.marketIdentity)) return null;
    marketIdentity =
      identifyMarket({
        marche: c.marketIdentity.code,
        periode: c.marketIdentity.period,
        ligne: c.marketIdentity.line,
        issue: c.marketIdentity.issue,
      }) || undefined;
    if (!marketIdentity) return null;
  }
  let evidence: Opportunity["evidence"];
  if (c.evidence !== undefined) {
    const e = c.evidence;
    if (
      !object(e) ||
      !date(e.detectedAt) ||
      !date(e.referenceReadAt) ||
      !text(e.referenceEvent) ||
      !text(e.referenceId) ||
      !(e.inverted === null || typeof e.inverted === "boolean") ||
      !nullableNumber(e.association) ||
      !nullableNumber(e.controlCount) ||
      !nullableNumber(e.controlMedian) ||
      !Array.isArray(e.components) ||
      e.components.length > 20
    )
      return null;
    const components: NonNullable<Opportunity["evidence"]>["components"] = [];
    for (const v of e.components) {
      if (
        !object(v) ||
        !text(v.name, 80) ||
        !finite(v.fairOdds) ||
        v.fairOdds <= 1
      )
        return null;
      components.push({ name: v.name, fairOdds: v.fairOdds });
    }
    evidence = {
      detectedAt: e.detectedAt,
      referenceReadAt: e.referenceReadAt,
      referenceEvent: e.referenceEvent,
      referenceId: e.referenceId,
      inverted: e.inverted as boolean | null,
      association: e.association as number | null,
      controlCount: e.controlCount as number | null,
      controlMedian: e.controlMedian as number | null,
      components,
    };
  }
  return {
    version: 1,
    capturedAt: c.capturedAt,
    startTime: c.startTime,
    observedAt: c.observedAt as string | null,
    bookmakerOdds: c.bookmakerOdds,
    fairOdds: c.fairOdds,
    evPct: c.evPct,
    reference: c.reference,
    marketIdentity,
    evidence,
    references,
    ...(method ? { method } : {}),
  };
}
export function captureOpportunity(
  item: Opportunity,
  capturedAt = new Date().toISOString(),
): BetCapture | undefined {
  return (
    normalizeCapture({
      version: 1,
      capturedAt,
      startTime: item.startTime,
      observedAt: item.observedAt || null,
      bookmakerOdds: item.bookmakerOdds,
      fairOdds: item.fairOdds,
      evPct: item.evPct,
      reference: item.reference || "Pinnacle",
      marketIdentity: item.marketIdentity,
      evidence: item.evidence,
      references: item.references || [],
      ...(item.method ? { method: item.method } : {}),
    }) || undefined
  );
}
