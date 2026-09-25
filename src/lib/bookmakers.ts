// Current ANJ-authorised sports-betting domains used as the legal allow-list.
// Recheck periodically against the ANJ official operators page.
export const ANJ_SPORTS_BOOKMAKERS = [
  "bet365.fr",
  "betclic.fr",
  "betsson.fr",
  "bwin.fr",
  "circusbet.fr",
  "daznbet.fr",
  "feelingbet.fr",
  "genybet.fr",
  "netbet.fr",
  "netbetsport.fr",
  "olybet.fr",
  "pmu.fr",
  "pokerstars.fr",
  "betstars.fr",
  "pokerstarsmobile.fr",
  "pokerstarssports.fr",
  "unibet.fr",
  "vbet.fr",
  "winamax.fr",
  "yesorno-jeu.fr"
] as const;

export const BOOKMAKER_LABELS: Record<string, string> = {
  "bet365.fr": "Bet365",
  "betclic.fr": "Betclic",
  "betsson.fr": "Betsson",
  "bwin.fr": "Bwin",
  "circusbet.fr": "CircusBet",
  "daznbet.fr": "DAZN Bet",
  "feelingbet.fr": "FeelingBet",
  "genybet.fr": "Genybet",
  "netbet.fr": "NetBet",
  "netbetsport.fr": "NetBet Sport",
  "olybet.fr": "OlyBet",
  "pmu.fr": "PMU",
  "pokerstars.fr": "PokerStars Sports",
  "betstars.fr": "BetStars",
  "pokerstarsmobile.fr": "PokerStars Mobile",
  "pokerstarssports.fr": "PokerStars Sports",
  "unibet.fr": "Unibet",
  "vbet.fr": "VBET",
  "winamax.fr": "Winamax",
  "yesorno-jeu.fr": "YesOrNo"
};

// Coverage currently exposed by The Odds API's FR region.
export const THE_ODDS_API_FR_BOOKMAKERS = {
  betclic_fr: "Betclic",
  netbet_fr: "NetBet",
  pmu_fr: "PMU",
  unibet_fr: "Unibet",
  winamax_fr: "Winamax"
} as const;

export const THE_ODDS_API_REFERENCE_BOOKMAKER = "pinnacle" as const;
