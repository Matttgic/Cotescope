# Test automatique prospectif

**Performance → Test automatique** suit trois portefeuilles indépendants de **1 000 € virtuels** : **CoteScope prudent**, **CoteScope équilibré** et un **témoin cotes-value** utilisant les sélections de l’adaptateur avec les mêmes limites de risque. Ce témoin ne reproduit pas toutes les tranches et mises du simulateur Python original.

La campagne `paper-v1` commence au premier cycle serveur réussi. Elle ne reprend aucun pari historique. Les sélections, mises, prix d’entrée et résultats sont conservés dans Neon ; le navigateur ne fait que lire le bilan. Le test continue lorsque le site est fermé. Aucune transaction chez un bookmaker n’est effectuée.

L’équilibré possède un propriétaire système et un démarrage distincts. Son ajout ne réinitialise ni la bankroll, ni les captures, ni la date de départ des campagnes existantes. Pour comparer des résultats, utiliser une période commune : les bilans cumulés depuis des dates différentes ne constituent pas une comparaison équitable.

## Prudent et équilibré

Les deux profils utilisent la même médiane pondérée et les mêmes contrôles de données. `robust-v1` est le profil prudent du scanner par défaut ; `balanced-v1` est utilisé par le nouveau portefeuille automatique. Les constantes sont des hypothèses de test, pas des paramètres calibrés sur les profits.

| Paramètre                                                    | Prudent                            | Équilibré                 |
| ------------------------------------------------------------ | ---------------------------------- | ------------------------- |
| Retrait de probabilité de base                               | 0,4 point                          | 0,2 point                 |
| Retrait supplémentaire avec Pinnacle seul                    | 0,6 point                          | 0,3 point                 |
| Pénalité d’âge                                               | `0,4 point × âge / 900 s`          | `0,2 point × âge / 900 s` |
| Pénalité de désaccord                                        | Moitié de l’écart entre références | Identique                 |
| Avantage théorique minimal après retrait                     | 2 %                                | 2 %                       |
| Fraîcheur, correspondance, références et marchés admissibles | Contrôles prudents                 | Identiques                |
| Limites Kelly et exposition                                  | Règles ci-dessous                  | Identiques                |

Exemple avec Pinnacle seul et des relevés tout frais : une estimation de 50 % devient 49 % en prudent et 49,5 % en équilibré. À la cote 2,07, l’avantage prudent est 1,43 % (rejeté), celui de l’équilibré 2,465 % (admissible sous les autres contrôles). Sur 1 000 €, le quart de Kelly équilibré propose alors une mise de 5,75 €. Les contrôles de référence peuvent encore produire zéro prise dans les deux profils, même avec un tampon réduit.

Chaque nouvelle capture conserve la version du profil, la probabilité centrale, le retrait appliqué, la probabilité utilisée et la fraction Kelly. Les versions antérieures restent compatibles.

## Fréquence des cycles

Chaque passage GitHub Actions lance le suivant quinze minutes après son début, même si la lecture de la source échoue. Cette cadence correspond à celle du collecteur cotes-value sans synchroniser les deux chaînes : une publication peut donc être lue au passage suivant. Un cron horaire redémarre la chaîne si elle s’arrête. Un seul cycle peut être actif ; les démarrages restent soumis aux délais GitHub. La variable de dépôt `PAPER_AUTO=non` arrête les passages automatiques. Les portefeuilles conservent leur historique et la date du dernier cycle réellement réussi ; aucun résultat ni relevé manquant n’est inventé.

## Mises

- Quart de Kelly : `0,25 × (p × cote − 1) / (cote − 1)` lorsque l’avantage est positif. CoteScope utilise sa probabilité prudente ; le témoin utilise la probabilité de référence de son adaptateur.
- Chaque mise est plafonnée à **1 % de la bankroll comptable**, arrondie au centime inférieur, avec un minimum de 1 €.
- L’exposition totale des prises ouvertes est plafonnée à **10 %**. Le cash disponible est également contrôlé.
- Une seule prise par événement reconnu et par portefeuille pendant la campagne, marchés binaires, cote ≤ 4, avantage ≥ 2 %, événement futur et relevé récent. Ces limites s’ajoutent aux contrôles propres au moteur.
- Les paramètres sont fixes pour la campagne ; le réglage du journal personnel ne change pas le test.

Exemple : à 1 000 €, la limite par prise est de 10 €, mais Kelly peut proposer moins. Une prise de 10 € à 2,20 réserve 10 € : bankroll comptable 1 000 €, cash libre 990 €. Si elle gagne, le profit net est 12 € et la bankroll passe à 1 012 € ; la nouvelle limite par prise est 10,12 €. Si elle perd, la bankroll passe à 990 €. Une cote affichée ne prouve pas qu’une mise réelle aurait été acceptée.

## Résultats et bilan

Le serveur lit les fichiers publics `opportunites_actuelles.json` et `paris.json` de `Matttgic/cotes-value`, branche `donnees`. Il n’appelle ni PulseScore ni The Odds API. Les règlements sont rapprochés par identité canonique du marché, bookmaker, événement et heure de début. Le gain publié doit être cohérent avec le statut et la mise publiés ; des statuts contradictoires restent en attente.

Le statut sportif provient donc du collecteur existant, sans vérification indépendante du score. Un résultat absent reste ouvert : il ne devient ni une perte ni un remboursement automatique. Le profit du portefeuille est recalculé avec **son propre prix d’entrée et sa propre mise**, jamais avec le gain du simulateur amont.

La bankroll comptable vaut 1 000 € plus le profit net réalisé ; le cash libre soustrait les mises encore réservées. Le ROI utilise toutes les mises réglées, remboursements compris. Le rendement de bankroll utilise les 1 000 € initiaux. La courbe et le drawdown réalisé suivent l’heure à laquelle le serveur reconnaît les règlements ; ceux d’un même cycle sont comptabilisés ensemble. Aucun prix de marché intermédiaire ne valorise les paris ouverts.

Les trois portefeuilles disposent d’un journal complet côté base ; l’interface affiche les 50 dernières prises. La campagne accepte au maximum 5 000 prises par portefeuille, puis cesse d’en ouvrir. Les captures de prix restent immuables. Les propriétaires système sont distincts du journal personnel et des anciennes détections Live. Aucune migration supplémentaire au-delà de `0001` et `0002` n’est nécessaire.

## Planification et contrôle

Le workflow GitHub Actions `CoteScope Paper Simulation` remplace l’ancien cron de collecte Live de ce dépôt. Il appelle `/api/cron/paper` environ toutes les quinze minutes, ainsi qu’après publication d’une modification du moteur paper, et peut être lancé avec **Run workflow**. La planification GitHub peut être retardée ; sa cadence n’est pas garantie. Le collecteur cotes-value conserve sa propre planification.

Prérequis : `DATABASE_URL` dans Vercel, schéma Neon à jour, et **le même `CRON_SECRET` dans Vercel et dans les secrets GitHub Actions de Cotescope**. Il s’agit d’une valeur privée aléatoire, distincte de la clé PulseScore ; ne jamais la publier dans Git ou le chat. Après ajout dans Vercel, redéployer. L’endpoint refuse les appels non autorisés avant toute lecture de source ou écriture.

`/api/paper` expose uniquement ce test virtuel commun, en lecture seule. `cronConfigured` établit la présence du secret côté Vercel ; **seul `lastCycleAt` établit qu’un cycle a réussi**. L’interface affiche une alerte après 20 minutes sans succès. Une source indisponible ou une erreur de base empêche la validation du cycle ; les écritures sont transactionnelles et les relances ne doublent pas les prises.

## Interpréter l’expérience

Il s’agit d’un test prospectif sur les candidats publiés, avec exécution hypothétique aux cotes affichées. Les frais, limites de comptes, variations de cote et refus de mise ne sont pas simulés. Un bilan favorable, notamment sur peu de prises, ne démontre pas une rentabilité future. Le rapport rétrospectif dans **Outils → Comparaison** reste séparé de cette campagne. L’absence de sélection CoteScope peut être le résultat normal de ses contrôles.
