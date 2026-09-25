import type { Opportunity } from "@/lib/types";

export const DEMO_OPPORTUNITIES: Opportunity[] = [
  {
    id: "demo-1",
    sport: "Football",
    competition: "Ligue 1",
    event: "Monaco — Lille",
    startTime: "20:45",
    market: "1X2",
    selection: "Monaco",
    bookmaker: "Winamax",
    bookmakerOdds: 2.22,
    referenceOdds: 2.08,
    fairOdds: 2.11,
    evPct: 5.2,
    opportunityScore: 88,
    freshnessSeconds: 42,
    confidence: "Forte",
    highOddsGuard: true,
    isBoost: false
  },
  {
    id: "demo-2",
    sport: "Tennis",
    competition: "ATP",
    event: "Joueur A — Joueur B",
    startTime: "14:30",
    market: "Vainqueur",
    selection: "Joueur A",
    bookmaker: "Betclic",
    bookmakerOdds: 1.91,
    referenceOdds: 1.82,
    fairOdds: 1.84,
    evPct: 3.8,
    opportunityScore: 81,
    freshnessSeconds: 28,
    confidence: "Forte",
    highOddsGuard: true,
    isBoost: false
  },
  {
    id: "demo-3",
    sport: "Basketball",
    competition: "EuroLeague",
    event: "Paris — Milan",
    startTime: "21:00",
    market: "Moneyline",
    selection: "Paris",
    bookmaker: "Unibet",
    bookmakerOdds: 2.05,
    referenceOdds: 1.94,
    fairOdds: 1.97,
    evPct: 4.1,
    opportunityScore: 84,
    freshnessSeconds: 63,
    confidence: "Forte",
    highOddsGuard: true,
    isBoost: true
  },
  {
    id: "demo-4",
    sport: "Football",
    competition: "Liga",
    event: "Valence — Villarreal",
    startTime: "18:30",
    market: "1X2",
    selection: "Valence",
    bookmaker: "PMU",
    bookmakerOdds: 5.8,
    referenceOdds: 4.5,
    fairOdds: 4.7,
    evPct: 23.4,
    opportunityScore: 69,
    freshnessSeconds: 177,
    confidence: "Faible",
    highOddsGuard: false,
    isBoost: false
  }
];

export const DEMO_ARBITRAGES = [
  {
    id: "arb-1",
    sport: "Tennis",
    event: "Joueur C — Joueur D",
    market: "Vainqueur",
    outcomes: [
      { selection: "Joueur C", bookmaker: "Winamax", odds: 2.12 },
      { selection: "Joueur D", bookmaker: "Bet365", odds: 2.02 }
    ],
    freshnessSeconds: 31
  },
  {
    id: "arb-2",
    sport: "Basketball",
    event: "Lyon-Villeurbanne — Monaco",
    market: "Moneyline",
    outcomes: [
      { selection: "ASVEL", bookmaker: "Betclic", odds: 2.36 },
      { selection: "Monaco", bookmaker: "Unibet", odds: 1.84 }
    ],
    freshnessSeconds: 74
  }
];

export const DEMO_HISTORY = [
  { id: "h1", sport: "Football", bookmaker: "Winamax", odds: 1.92, stake: 10, result: "win", profit: 9.2, clvPct: 3.1 },
  { id: "h2", sport: "Tennis", bookmaker: "Betclic", odds: 2.05, stake: 10, result: "loss", profit: -10, clvPct: 1.4 },
  { id: "h3", sport: "Basketball", bookmaker: "Unibet", odds: 1.87, stake: 10, result: "win", profit: 8.7, clvPct: 2.8 },
  { id: "h4", sport: "Football", bookmaker: "PMU", odds: 2.21, stake: 10, result: "win", profit: 12.1, clvPct: 4.3 },
  { id: "h5", sport: "Tennis", bookmaker: "Bet365", odds: 1.78, stake: 10, result: "loss", profit: -10, clvPct: -0.7 }
];
