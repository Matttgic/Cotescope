# CoteScope FR

Projet séparé d'EdgeScope. Scanner privé de cotes pour le marché français.

## Objectif

- Bookmakers autorisés par l'ANJ uniquement
- Value bets avec cote juste / EV / score de qualité
- Garde-fou grosses cotes activé par défaut
- Arbitrages, boosts, mouvements de lignes, CLV, tracker et analytics
- Mobile-first
- Aucun secret API dans le navigateur

## État du MVP

Le frontend fonctionne sans secret en `ODDS_PROVIDER=demo`. Le provider `theoddsapi` est également implémenté côté serveur pour Betclic, NetBet, PMU, Unibet et Winamax, avec Pinnacle comme référence no-vig pour le H2H. Les données démo restent explicitement marquées.

## Installation

```bash
cp .env.example .env.local
npm install
npm run dev
```

## Architecture données

1. Le serveur récupère les événements et cotes.
2. Les cotes des bookmakers FR sont normalisées.
3. Une source de référence sert à calculer la probabilité sans marge.
4. `EV = cote_bookmaker × probabilité_juste - 1`.
5. Les opportunités sont filtrées par fraîcheur, qualité, stabilité et garde-fou grosses cotes.
6. Les snapshots servent au CLV et aux mouvements de lignes.

## Garde-fou grosses cotes

- Par défaut : masquer les cotes > 4.00.
- Au-delà : score >= 85, EV >= 5% et cote <= 8.00.
- Une grosse divergence isolée n'est jamais considérée comme une opportunité suffisante.

## Prochain branchement

- Étendre les marchés réels au-delà du H2H
- Cron de scan optimisé par quotas
- Supabase dédié
- Telegram dédié
- Règlement automatique des paris
- Arbitrage / middle / boost detectors

## Légalité / responsabilité

CoteScope FR est un outil d'analyse. Il ne garantit aucun gain. Les domaines autorisés doivent être resynchronisés périodiquement avec la liste officielle ANJ.

## Mode live The Odds API

Configurer `ODDS_PROVIDER=theoddsapi` et `THE_ODDS_API_KEY` dans Vercel. La clé reste uniquement côté serveur. Le scanner compare les bookmakers FR couverts par le provider à Pinnacle après retrait de la marge.
