import { candidateKey } from "./decisionEngine";
import { captureOpportunity, type BetCapture } from "./betCapture";
import { engineProfit } from "./engineHistory";
import { fractionalKelly } from "./value";
import type { BetStatus } from "./journal";
import type { Opportunity } from "./types";

export const PAPER_VERSION = "paper-v1";
export const PAPER_POLICY = Object.freeze({
  initialBankroll: 1000,
  kellyFraction: 0.25,
  maxStakeFraction: 0.01,
  maxExposureFraction: 0.1,
  minimumStake: 1,
  maxOdds: 4,
  maxTrades: 5000,
});
export type PaperMode = "cotescope" | "cotes-value";
export type PaperState = {
  schema: "cotescope.paper.state.v1";
  mode: PaperMode;
  version: string;
  startedAt: string;
  lastCycleAt: string | null;
  cycleCount: number;
  policy: typeof PAPER_POLICY;
  lastSelected: number;
  lastSettled: number;
  sourceDiagnostics: unknown;
};
export type PaperTrade = {
  schema: "cotescope.paper.trade.v1";
  mode: PaperMode;
  key: string;
  eventKey: string;
  createdAt: string;
  event: string;
  sport: string;
  competition: string;
  bookmaker: string;
  selection: string;
  market: string;
  odds: number;
  stake: number;
  status: BetStatus;
  price: BetCapture;
  settlement: null | {
    status: BetStatus;
    sourceStatus: string;
    sourceIds: string[];
    readAt: string;
    settledAt: string;
    profit: number;
  };
};
const cent = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const floorCent = (n: number) => Math.floor((n + Number.EPSILON) * 100) / 100;
const stamp = (v: unknown) =>
  typeof v === "string" && /(Z|[+-]\d{2}:\d{2})$/.test(v) ? Date.parse(v) : NaN;
const normalize = (v: string) =>
  v
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
export function paperEventKey(item: Opportunity) {
  return JSON.stringify([
    item.sport,
    normalize(item.event),
    Date.parse(item.startTime),
  ]);
}
export function newPaperState(mode: PaperMode, now: number): PaperState {
  return {
    schema: "cotescope.paper.state.v1",
    mode,
    version: PAPER_VERSION,
    startedAt: new Date(now).toISOString(),
    lastCycleAt: null,
    cycleCount: 0,
    policy: PAPER_POLICY,
    lastSelected: 0,
    lastSettled: 0,
    sourceDiagnostics: null,
  };
}
export function paperMetrics(
  trades: PaperTrade[],
  initialBankroll: number = PAPER_POLICY.initialBankroll,
  now = Date.now(),
) {
  let netCents = 0,
    openCents = 0,
    settledStakeCents = 0,
    peak = initialBankroll,
    equity = initialBankroll,
    maxDrawdownPct = 0;
  const settled = trades.filter((t) => t.status !== "open");
  const curve = [{ at: null as string | null, value: initialBankroll }];
  const cycles = new Map<string, number>();
  for (const trade of settled) {
    if (!trade.settlement) throw new Error("paper_settlement_missing");
    const at = trade.settlement.readAt;
    cycles.set(
      at,
      (cycles.get(at) || 0) + Math.round(trade.settlement.profit * 100),
    );
    settledStakeCents += Math.round(trade.stake * 100);
  }
  // A cycle posts all its settlements atomically; there is no intracycle order.
  for (const [at, profitCents] of [...cycles].sort(
    (a, b) => stamp(a[0]) - stamp(b[0]),
  )) {
    netCents += profitCents;
    equity = cent(initialBankroll + netCents / 100);
    peak = Math.max(peak, equity);
    maxDrawdownPct = Math.max(
      maxDrawdownPct,
      peak > 0 ? ((peak - equity) / peak) * 100 : 0,
    );
    curve.push({ at, value: equity });
  }
  for (const trade of trades.filter((t) => t.status === "open"))
    openCents += Math.round(trade.stake * 100);
  return {
    initialBankroll,
    equity,
    cashAvailable: cent(equity - openCents / 100),
    exposure: openCents / 100,
    net: netCents / 100,
    returnPct: (netCents / 100 / initialBankroll) * 100,
    roiPct: settledStakeCents > 0 ? (netCents / settledStakeCents) * 100 : null,
    settledStakes: settledStakeCents / 100,
    trades: trades.length,
    settled: settled.length,
    open: trades.length - settled.length,
    pendingResults: trades.filter(
      (t) => t.status === "open" && stamp(t.price.startTime) <= now,
    ).length,
    maxDrawdownPct,
    curve,
  };
}
/** Make prospective entries only. Prices are hypothetical fills at the published quote. */
export function openPaperTrades(
  mode: PaperMode,
  items: Opportunity[],
  existing: PaperTrade[],
  now: number,
  startedAt: string,
): PaperTrade[] {
  if (now < stamp(startedAt)) return [];
  const metrics = paperMetrics(existing, PAPER_POLICY.initialBankroll, now);
  const keys = new Set(existing.map((t) => t.key)),
    events = new Set(existing.map((t) => t.eventKey));
  const opened: PaperTrade[] = [];
  let reserved = metrics.exposure;
  for (const item of [...items].sort(
    (a, b) => b.evPct - a.evPct || a.id.localeCompare(b.id),
  )) {
    const quote = stamp(item.observedAt),
      start = stamp(item.startTime);
    if (
      item.marketIdentity?.settlement !== "binary" ||
      item.bookmakerOdds > PAPER_POLICY.maxOdds ||
      !Number.isFinite(quote) ||
      quote > now + 60000 ||
      now - quote > (item.method?.referenceCount === 1 ? 180 : 900) * 1000 ||
      !Number.isFinite(start) ||
      start <= now ||
      item.evPct < 2
    )
      continue;
    const key = item.id.replace(/^(cv|cs)-/, ""),
      eventKey = paperEventKey(item);
    if (
      keys.has(key) ||
      events.has(eventKey) ||
      existing.length + opened.length >= PAPER_POLICY.maxTrades
    )
      continue;
    const fraction =
      mode === "cotescope"
        ? item.method?.stakeFraction
        : fractionalKelly(
            item.bookmakerOdds,
            1 / item.fairOdds,
            PAPER_POLICY.kellyFraction,
            PAPER_POLICY.maxStakeFraction,
          );
    if (
      typeof fraction !== "number" ||
      !Number.isFinite(fraction) ||
      fraction <= 0 ||
      fraction > PAPER_POLICY.maxStakeFraction
    )
      continue;
    const stake = floorCent(
      Math.min(
        metrics.equity * fraction,
        metrics.equity * PAPER_POLICY.maxStakeFraction,
        metrics.equity * PAPER_POLICY.maxExposureFraction - reserved,
        metrics.equity - reserved,
      ),
    );
    if (stake < PAPER_POLICY.minimumStake) continue;
    const price = captureOpportunity(item, new Date(now).toISOString());
    if (!price) continue;
    opened.push({
      schema: "cotescope.paper.trade.v1",
      mode,
      key,
      eventKey,
      createdAt: new Date(now).toISOString(),
      event: item.event,
      sport: item.sport,
      competition: item.competition,
      bookmaker: item.bookmaker,
      selection: item.selection,
      market: item.market,
      odds: item.bookmakerOdds,
      stake,
      status: "open",
      price,
      settlement: null,
    });
    keys.add(key);
    events.add(eventKey);
    reserved = cent(reserved + stake);
  }
  return opened;
}
const STATUS: Record<string, BetStatus> = {
  gagne: "win",
  perdu: "loss",
  rembourse: "void",
  demi_gagne: "half_win",
  demi_perdu: "half_loss",
};
/** Only labels for this exact event/market, with internally consistent settlement proof. */
export function settlePaperTrades(
  trades: PaperTrade[],
  input: unknown,
  now: number,
): PaperTrade[] {
  if (!Array.isArray(input)) throw new Error("invalid_history");
  const labels = new Map<string, Record<string, unknown>[]>();
  for (const value of input) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const r = value as Record<string, unknown>,
      status = String(r.statut),
      start = stamp(r.debut),
      settled = stamp(r.regle_le);
    if (
      !Object.hasOwn(STATUS, status) ||
      !Number.isFinite(start) ||
      !Number.isFinite(settled) ||
      settled < start ||
      settled > now ||
      typeof r.mise !== "number" ||
      !Number.isFinite(r.mise) ||
      r.mise <= 0 ||
      typeof r.cote !== "number" ||
      !Number.isFinite(r.cote) ||
      r.cote <= 1 ||
      typeof r.gain !== "number" ||
      !Number.isFinite(r.gain) ||
      Math.abs(engineProfit(status, r.mise, r.cote)! - r.gain) > 0.02
    )
      continue;
    const key = candidateKey(r);
    labels.set(key, [...(labels.get(key) || []), r]);
  }
  const changed: PaperTrade[] = [];
  for (const trade of trades) {
    if (trade.status !== "open" || stamp(trade.price.startTime) > now) continue;
    const matches = (labels.get(trade.key) || []).filter(
      (r) =>
        stamp(r.debut) === stamp(trade.price.startTime) &&
        normalize(`${r.domicile} — ${r.exterieur}`) === normalize(trade.event),
    );
    const statuses = new Set(matches.map((r) => String(r.statut)));
    if (statuses.size !== 1) continue;
    const sourceStatus = [...statuses][0],
      status = STATUS[sourceStatus];
    const profit = cent(engineProfit(sourceStatus, trade.stake, trade.odds)!);
    const settledAt = new Date(
      Math.max(...matches.map((r) => stamp(r.regle_le))),
    ).toISOString();
    changed.push({
      ...trade,
      status,
      settlement: {
        status,
        sourceStatus,
        sourceIds: [...new Set(matches.map((r) => String(r.id || "")))]
          .filter(Boolean)
          .slice(0, 20),
        readAt: new Date(now).toISOString(),
        settledAt,
        profit,
      },
    });
  }
  return changed;
}
