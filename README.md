# CoteScope

Une console française pour comparer les prix, examiner l’EV et tenir un journal de prises. Méthode de décision CoteScope robuste par défaut, prix publiés par cotes-value, calculs inspectables et suivi volontaire. La [méthode et sa comparaison exploratoire](docs/METHOD.md) distinguent la décision de la collecte et rendent les limites mesurables.

## Démarrer

Node **24.19.0** (voir `.nvmrc`), npm et un navigateur moderne.

```bash
cp .env.example .env.local   # seulement si ce fichier n’existe pas
npm ci
npm run dev
```

Dans un environnement cloud utilisant un proxy HTTP, activer son support natif dans Node **au démarrage** :

```bash
NODE_USE_ENV_PROXY=1 npm run dev -- --hostname 127.0.0.1 --port 3000
```

En production :

```bash
npm run build
NODE_USE_ENV_PROXY=1 npm run start -- --hostname 127.0.0.1 --port 3000
```

Next.js peut régénérer `next-env.d.ts` et ajuster `tsconfig.json` au démarrage ou à la compilation.

## Sources et parcours

À l’ouverture, le scanner sélectionne **CoteScope** : médiane pondérée des références unitaires, marge de stress et décision sur l’avantage prudent. `DEFAULT_DATA_SOURCE` peut être défini à `cotescope`, `cotes-value`, `demo` ou `live`. La page résout ce choix au démarrage de chaque requête. Une erreur de source ne produit jamais une démo implicite. L’ancien réglage `ODDS_PROVIDER` n’est plus utilisé.

Pour mettre la version en ligne, suivre [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). Le flux public et le journal local fonctionnent sans clé et sans Neon.

La navigation se compose de cinq onglets : **Scanner**, **Journal**, **Performance**, **Outils** et **Paramètres**. Sur mobile, la barre reste en bas de l’écran ; seul le contenu de la vue active défile. Le scanner sépare **Opportunités**, **Filtres** et **Synthèse**, avec conservation des filtres entre les vues. **Outils** regroupe arbitrages et méthode. Les paramètres séparent bankroll, PulseScore et synchronisation, sans superposer un formulaire au scanner.

L’identité visuelle utilise une palette bleu nuit/violet, une couverture sportive originale, le symbole CoteScope, des pictogrammes de sports et les écussons des clubs identifiés. Les raccourcis de sports filtrent directement le scanner. Les ressources sont servies localement ; provenance et mentions dans [docs/ASSETS.md](docs/ASSETS.md).

- **CoteScope** : moteur de décision distinct sur les références unitaires horodatées du flux publié. Avantage prudent ≥ 2 %, une sélection par match reconnu, marchés binaires et quart de Kelly plafonné à 1 %. Version et calculs conservés dans les preuves du journal. Aucun appel payant.
- **Démo** : huit signaux illustratifs, sept retenus par défaut. EV calculée à partir des prix, horodatages relatifs, journal séparé. Aucune clé requise.
- **Live** : cache des détections du moteur CoteScope. Nécessite Neon, les migrations `neon/migrations/0001_bet_history.sql` puis `neon/migrations/0002_capture_and_partial_settlement.sql`, une collecte réussie et les variables serveur de `.env.example`.
- **Cotes-value** : lecture seule du flux publié par [Matttgic/cotes-value](https://github.com/Matttgic/cotes-value), marchés canoniques contrôlés (résultats, handicaps, totaux, doubles chances, scores exacts, mi-temps/fin et périodes), consensus prioritaire et preuves de comparaison détaillées. Aucune collecte payante déclenchée par la console.

Le scanner filtre par sport, bookmaker, marché, recherche, EV, score et cote maximale. Une ligne ouvre son calcul, les observations et les contrôles publiés. Le quart de Kelly est réservé aux marchés binaires, plafonné à 2 % de la bankroll. Avec remboursement ou demi-règlement, l’écart de prix reste affiché mais le Kelly et l’espérance en euros sont désactivés. Les lignes à demi-règlement sont enregistrables ; le journal prend en charge demi-gain et demi-perte.

Le **Journal** enregistre uniquement les prises ajoutées par l’utilisateur. Mises, résultats (y compris demi-gain et demi-perte), export CSV, export JSON des preuves et synchronisation personnelle sont disponibles. Chaque nouvelle prise conserve les prix, les références et les preuves publiées à cet instant. Ces captures restent intactes après modification du résultat. Les clés restent compatibles avec l’ancien tracker. La démo n’est jamais envoyée au cloud.

**Performance** calcule le profit, le ROI sur les mises réglées, le taux de réussite, le résultat par bookmaker et la courbe des paris réglés par date d’enregistrement. Le ROI du journal conserve son dénominateur historique : mises avec gain ou perte, remboursements complets exclus. Les mises des demi-règlements sont comptées intégralement ; le taux de réussite binaire reste absent lorsqu’il y a des demi-règlements. Aucun historique de performance n’est inventé.

Le sous-onglet **Bilan cotes-value** lit `/api/cotes-value/history` et le fichier actif `paris.json` de la branche `donnees`. Il affiche profit simulé, ROI (remboursements inclus), exposition et CLV moyenne avec sa couverture. Les archives mensuelles ne sont pas incluses. Filtres par référence, tranche A–E/X, sport, bookmaker, marché et statut ; chaque simulation expose ses prix et les preuves disponibles.

La vue **Uniques** retient la première détection avant les filtres, avec l’ordre des références du moteur pour départager les égalités. Le témoin **Pinnacle brut** reste isolé. La CLV est recalculée depuis les prix publiés et acceptée seulement pour un pari réglé, avec un relevé dans les 30 minutes avant le début et un résultat cohérent avec la CLV publiée. Aucun relevé absent n’est remplacé par zéro. Avant le 7 octobre 2026, l’heure de clôture peut être celle du cycle, à quelques minutes près.

Les gains doivent correspondre au statut (y compris demi-gain, demi-perte et remboursement), sinon ils sont exclus du ROI. Cette vérification arithmétique ne valide pas le score sportif : l’absence de preuve de règlement reste visible.

**Arbitrages** contient un calculateur à deux issues et des exemples explicites. Le détecteur live n’est pas raccordé.

**Méthode** explique les calculs, l’origine des signaux et les limites du score.

## Validation

```bash
npm test
npm run typecheck
npm run build
```

Parcours navigateur, avec le serveur démarré en mode cotes-value et sans base (sources simulées dans les tests, démo sélectionnée explicitement) :

```bash
npx playwright install chromium
npm run test:browser
```

Sur la machine cloud, Chromium est déjà installé :

```bash
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:browser
```

Variables optionnelles : `TEST_BASE_URL` (serveur cible), `TEST_ARTIFACT_DIR` (captures et export, par défaut `/tmp/cotescope-browser`). Les tests utilisent un profil isolé et ne modifient pas votre journal.

Les checks sont aussi configurés dans la CI. Voir [l’analyse de la refonte](docs/REVIEW.md) pour les corrections et limites.

## Renseigner PulseScore Pro

Dans les **secrets de l’environnement cloud**, ajouter la clé sous le nom **`PULSESCORE_KEY`**, avec la destination **`api.pulsescore.net`**. Revoir et enregistrer la configuration, puis publier l’environnement. Ne pas coller la valeur dans le chat, le code ou un champ `NEXT_PUBLIC_*`. Le nom et l’en-tête `X-Secret` sont les mêmes que dans `cotes-value`.

Les paramètres de la console affichent si la variable est présente côté serveur. Cette présence ne prouve pas l’accès API. Le premier contrôle est explicite :

```bash
npm run pulse:check                 # zéro requête : vérifie les prérequis
npm run pulse:check -- --allow-paid  # une seule tentative : Winamax / football / première page
```

Le contrôle utilise le proxy de l’environnement et sa confiance TLS. Sur une installation locale utilisant `.env.local`, charger explicitement ce fichier pour le CLI : `node --use-env-proxy --env-file=.env.local scripts/pulse-check.mjs --allow-paid`.

Une réponse valide démontre l’accès à cette page, pas le niveau d’abonnement ni toute la couverture. Le contrôle ne compare pas ces prix aux références et ne produit pas de paris : il est distinct du scanner. Il n’y a ni nouvelle pagination, ni réessai automatique, ni activation d’une collecte planifiée. Les erreurs 401/403/429 restent identifiables ; `Retry-After` est respecté entre deux contrôles. Un verrou local empêche deux pilotes simultanés. Les diagnostics sans clé ni réponse brute sont conservés dans `.local/pulsescore/connection.json` (ignoré par Git).

Un premier contrôle authentifié a réussi le 7 octobre 2026 : une tentative Winamax/football, 30 événements, aucune nouvelle pagination. Les paramètres affichent le diagnostic local de ce contrôle passé ; une clé remplacée nécessite un nouveau contrôle. Les horodatages de prix des événements n’ont pas été identifiés par le pilote : l’heure de téléchargement ne prouve pas la fraîcheur des cotes. Les fichiers publiés continuent à fonctionner indépendamment de ce contrôle.

## Mise à jour du journal cloud

Appliquer `0002_capture_and_partial_settlement.sql` après `0001` sur votre base Neon pour synchroniser les captures et les nouveaux statuts. La migration est répétable et conserve les prises existantes. Elle est testée sur PostgreSQL embarqué via PGlite, sans connexion à votre base de production. Aucune migration distante n’est exécutée automatiquement.

Un serveur au schéma ancien renvoie une erreur explicite ; les prises restent dans le navigateur et exportables. Les captures antérieures inexistantes restent absentes. Les crons règlent uniquement les détections serveur et ne changent pas les résultats du journal personnel.

## Données live et secrets

`THE_ODDS_API_KEY`, `DATABASE_URL` et `CRON_SECRET` restent côté serveur. Ne jamais utiliser le préfixe `NEXT_PUBLIC_` pour ces valeurs. La clé **PulseScore Pro** reste utilisée par votre collecteur `cotes-value`. La console réutilise ses fichiers publiés sans clé ; le contrôle direct décrit ci-dessous requiert `PULSESCORE_KEY`. Les lectures sont limitées en taille et en durée, avec une erreur visible si la source est indisponible.

Le scanner lit le cache ; l’actualisation ne lance pas un appel payant. Le collecteur exige des cotes de moins de 120 secondes ; l’affichage écarte les snapshots de plus de 15 minutes.

Le classement est heuristique. L’EV suppose une probabilité estimée correcte. Les scores, simulations et arbitrages théoriques ne garantissent aucun gain. **18+ · Risque de perte · Joueurs Info Service : 09 74 75 13 13.**
