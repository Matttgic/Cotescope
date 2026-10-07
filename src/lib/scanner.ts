import type { Opportunity } from "./types";
import { passesHighOddsGuard } from "./value";

export type Filters = {
  sport: string;
  bookmaker: string;
  market: string;
  search: string;
  minEv: number;
  maxOdds: number;
  minScore: number;
  guarded: boolean;
  sort: string;
};
export const DEFAULT_FILTERS: Filters = {
  sport: "Tous",
  bookmaker: "Tous",
  market: "Tous",
  search: "",
  minEv: 2,
  maxOdds: 4,
  minScore: 70,
  guarded: true,
  sort: "quality",
};

export function quoteAge(item: Opportunity, now = Date.now()): number {
  if (item.observedAt) {
    const time = Date.parse(item.observedAt);
    return Number.isFinite(time) ? Math.max(0, (now - time) / 1000) : Infinity;
  }
  return item.freshnessSeconds;
}

export function filterOpportunities(
  items: Opportunity[],
  filters: Filters,
  now = Date.now(),
): Opportunity[] {
  const query = filters.search.toLocaleLowerCase("fr");
  return items
    .filter((item) => {
      const start = Date.parse(item.startTime);
      return (
        Number.isFinite(item.bookmakerOdds) &&
        item.bookmakerOdds > 1 &&
        Number.isFinite(item.evPct) &&
        item.fairOdds > 1 &&
        Number.isFinite(item.fairOdds) &&
        Number.isFinite(item.opportunityScore) &&
        Number.isFinite(start) &&
        start > now &&
        quoteAge(item, now) <= (item.method?.referenceCount === 1 ? 180 : 900) &&
        (filters.sport === "Tous" || item.sport === filters.sport) &&
        (filters.bookmaker === "Tous" ||
          item.bookmaker === filters.bookmaker) &&
        (filters.market === "Tous" ||
          item.marketIdentity?.code === filters.market ||
          item.market === filters.market) &&
        `${item.event} ${item.selection} ${item.competition} ${item.market}`
          .toLocaleLowerCase("fr")
          .includes(query) &&
        item.evPct >= filters.minEv &&
        item.opportunityScore >= filters.minScore &&
        item.bookmakerOdds <= filters.maxOdds &&
        (!filters.guarded ||
          (item.highOddsGuard &&
            passesHighOddsGuard(
              item.bookmakerOdds,
              item.opportunityScore,
              item.evPct,
            )))
      );
    })
    .sort((a, b) =>
      filters.sort === "ev"
        ? b.evPct - a.evPct
        : filters.sort === "time"
          ? Date.parse(a.startTime) - Date.parse(b.startTime)
          : b.opportunityScore - a.opportunityScore || b.evPct - a.evPct,
    );
}
