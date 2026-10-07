import {
  captureOpportunity,
  normalizeCapture,
  type BetCapture,
} from "./betCapture";
import type { Opportunity, Sport } from "./types";

export type BetStatus =
  "open" | "win" | "loss" | "void" | "half_win" | "half_loss";
export type Bet = {
  id: string;
  opportunityId: string;
  createdAt: string;
  updatedAt: string;
  sport: Sport;
  competition: string;
  event: string;
  market: string;
  selection: string;
  bookmaker: string;
  odds: number;
  stake: number;
  initialEvPct: number;
  opportunityScore: number;
  status: BetStatus;
  capture?: BetCapture;
};

export function validBet(value: unknown): value is Bet {
  if (!value || typeof value !== "object") return false;
  const b = value as Bet;
  return (
    [
      b.id,
      b.opportunityId,
      b.event,
      b.market,
      b.selection,
      b.bookmaker,
      b.sport,
    ].every((v) => typeof v === "string" && !!v) &&
    Number.isFinite(b.odds) &&
    b.odds > 1 &&
    Number.isFinite(b.stake) &&
    b.stake >= 0 &&
    Number.isFinite(b.initialEvPct) &&
    Number.isFinite(b.opportunityScore) &&
    Number.isFinite(Date.parse(b.createdAt)) &&
    ["open", "win", "loss", "void", "half_win", "half_loss"].includes(
      b.status,
    ) &&
    (b.capture === undefined || normalizeCapture(b.capture) !== null)
  );
}

export function normalizeBets(values: unknown): Bet[] {
  if (!Array.isArray(values)) return [];
  return values
    .filter(validBet)
    .map((b) => ({
      ...b,
      updatedAt: b.updatedAt || b.createdAt,
      capture: b.capture ? normalizeCapture(b.capture)! : undefined,
    }));
}

export function mergeBets(local: Bet[], remote: Bet[]): Bet[] {
  const map = new Map<string, Bet>();
  for (const b of [...remote, ...local]) {
    const previous = map.get(b.opportunityId);
    if (!previous || Date.parse(b.updatedAt) >= Date.parse(previous.updatedAt))
      map.set(b.opportunityId, b);
  }
  return [...map.values()].sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );
}

export function createBet(item: Opportunity, stake: number): Bet {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    opportunityId: item.id,
    createdAt: now,
    updatedAt: now,
    sport: item.sport,
    competition: item.competition,
    event: item.event,
    market: item.market,
    selection: item.selection,
    bookmaker: item.bookmaker,
    odds: item.bookmakerOdds,
    stake,
    initialEvPct: item.evPct,
    opportunityScore: item.opportunityScore,
    status: "open",
    capture: captureOpportunity(item, now),
  };
}

export function profit(bet: Bet): number {
  if (bet.status === "win") return bet.stake * (bet.odds - 1);
  if (bet.status === "half_win") return (bet.stake * (bet.odds - 1)) / 2;
  if (bet.status === "loss") return -bet.stake;
  if (bet.status === "half_loss") return -bet.stake / 2;
  return 0;
}
export function hasProfitSettlement(bet: Bet): boolean {
  return ["win", "loss", "half_win", "half_loss"].includes(bet.status);
}

export function journalStats(bets: Bet[]) {
  const settled = bets.filter(hasProfitSettlement);
  const stakes = settled.reduce((s, b) => s + b.stake, 0);
  const net = settled.reduce((s, b) => s + profit(b), 0);
  const hasPartial = settled.some(
    (b) => b.status === "half_win" || b.status === "half_loss",
  );
  return {
    hasPartial,
    refunded: bets.filter((b) => b.status === "void").length,
    settled: settled.length,
    stakes,
    net,
    roi: stakes ? (net / stakes) * 100 : null,
    winRate:
      settled.length && !hasPartial
        ? (settled.filter((b) => b.status === "win").length / settled.length) *
          100
        : null,
    exposure: bets
      .filter((b) => b.status === "open")
      .reduce((s, b) => s + b.stake, 0),
  };
}

export function betsCsv(bets: Bet[]): string {
  const cell = (value: unknown) =>
    `"${(typeof value === "string"
      ? value.replace(/^[=+@\-\t\r]/, "'$&")
      : String(value)
    ).replaceAll('"', '""')}"`;
  return (
    "\uFEFF" +
    [
      [
        "Date",
        "Événement",
        "Sélection",
        "Bookmaker",
        "Cote",
        "Mise",
        "Statut",
        "Profit",
        "EV initiale",
        "Cote juste à la prise",
        "Référence à la prise",
        "Horodatage du prix",
      ],
      ...bets.map((b) => [
        b.createdAt,
        b.event,
        b.selection,
        b.bookmaker,
        b.odds,
        b.stake,
        b.status,
        Number(profit(b).toFixed(2)),
        Number(b.initialEvPct.toFixed(2)),
        b.capture?.fairOdds ?? "",
        b.capture?.reference ?? "",
        b.capture?.observedAt ?? "",
      ]),
    ]
      .map((row) => row.map(cell).join(";"))
      .join("\r\n")
  );
}
