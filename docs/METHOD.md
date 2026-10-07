# Méthode CoteScope robuste v1

La décision CoteScope est distincte du consensus moyen de cotes-value. Elle ne lit ni l’EV publiée, ni le consensus agrégé, ni les résultats ou prix de clôture pour sélectionner une prise. La **collecte, les probabilités de référence corrigées de marge, les correspondances de matchs et les contrôles des intitulés restent fournis par cotes-value**. Il s’agit d’un moteur de décision sur les candidats publiés, pas d’un modèle sportif ni d’une collecte autonome de tous les prix.

## Règle fixée avant le replay

1. Même bookmaker, match, marché, période, ligne, issue et joueur. Dernier prix bookmaker disponible ; les anciens prix plus favorables ne le remplacent pas.
2. Marché canonique contrôlé, binaire, avant le début. Refus des marchés remboursables ou fractionnés faute de probabilités des différents règlements.
3. Références unitaires connues avec identifiant de match, association ≥ 0,90, heure zonée et écart de lecture ≤ 120 secondes. Consensus et composants sans horodatage propre ne comptent pas comme corroboration. Une source n’est comptée qu’une fois.
4. Une référence seule doit être Pinnacle, associée à ≥ 0,95 et lue depuis ≤ 180 secondes. Plusieurs références : âge maximal 900 secondes. Ce sont des heures de collecte publiées, pas une preuve de l’âge de la mise à jour chez l’opérateur.
5. Estimation centrale par médiane pondérée des probabilités unitaires : Pinnacle 1, Betfair 0,85, Polymarket 0,5, Kalshi 0,5. Poids heuristiques, sans calibration de performance. Désaccord maximal : 6 points de probabilité et ratio de probabilités ≤ 1,25.
6. Marge de stress en probabilité : `0,004 + (max(p)-min(p))/2 + (0,006 si une référence) + 0,004 × âge/900`. Probabilité prudente = centrale − marge. Ce scénario n’est ni un intervalle de confiance ni une garantie sur la probabilité réelle.
7. Avantage prudent : `100 × (cote × probabilité prudente − 1)` ; admissible entre 2 % et 25 %. Cotes ≤ 6. Au-delà de 4, au moins deux références, avantage ≥ 5 % et garde-fou de qualité requis.
8. Une sélection par identité de match reconnue, classée par avantage prudent puis qualité, avec départage stable. Les alias peuvent empêcher d’identifier des doublons entre opérateurs ; les références peuvent être corrélées.
9. Quart de Kelly sur la probabilité prudente, recommandation et enregistrement plafonnés à 1 % de la bankroll. Une autre prise CoteScope ouverte sur le même match reconnu bloque l’enregistrement. Le journal conserve la version, les probabilités et la marge de stress dans la capture immuable.

Le mode **CoteScope** est le défaut. **Cotes-value** conserve l’ancien adaptateur pour comparaison. La démo et le cache Live restent explicites. Un échec de source ne produit jamais d’exemples en remplacement.

## Comparaison exploratoire

Le rapport [method-comparison.json](../src/data/method-comparison.json) est issu d’un replay chronologique des archives publiées du 5 au 7 octobre 2026, révision `7fed7e82988c55e3082226626818081508067ddc`. Il analyse 44 722 lignes, 1 650 instants de détection et 4 150 identités de candidat. Parmi les lignes, 40 887 sont des références « Pinnacle brut » avec marge, exclues des deux méthodes. Le dernier jour est partiel. Les candidats admissibles à l’ancien adaptateur apparaissent seulement le 7 octobre : les trois jours nominaux ne représentent donc pas trois journées de sélection contrôlée.

| Mesure | Ancien adaptateur contrôlé | CoteScope robuste |
| --- | ---: | ---: |
| Sélections uniques | 21 | 1 |
| Résultats publiés exploitables | 9 | 1 |
| Sans résultat exploitable | 12 | 0 |
| Couverture des résultats | 42,86 % | 100 % |

**Une seule prise réglée CoteScope ne démontre aucun avantage de rendement.** Les cohortes réglées diffèrent. Aucun seuil n’a été ajusté pour améliorer les gains observés. La référence de comparaison est l’ancien adaptateur de cette console dans un univers commun de marchés binaires et de cotes ≤ 6 ; ce n’est pas la reproduction de toutes les simulations Python A–X. La méthode robuste peut prendre une sélection plus tard, après avoir attendu des preuves suffisantes.

Le replay sélectionne avec les champs de détection disponibles à cet instant. Il fige toutes les décisions avant de joindre les règlements. Les résultats sont les statuts publiés, admis seulement avec heure de règlement postérieure au début et gain cohérent. Les conflits et résultats manquants restent comptés, sans les assimiler à une perte ou un gain. Les rendements exploratoires, sous un volet replié dans l’application, utilisent une mise fixe de 1 unité par prise réglée, remboursements inclus, sans commissions, frais, capitalisation ou limites opérateurs.

Les archives contiennent des candidats **déjà présélectionnés** par cotes-value à partir de 2 % d’écart. Un replay ne peut donc pas mesurer la couverture de tous les prix ni découvrir rétrospectivement les paris absents. La sélection stricte et le manque d’historique contrôlé réduisent fortement l’échantillon. La prochaine validation utile est une collecte prospective de l’univers complet et des décisions des deux politiques, à budget connu ; elle n’est pas activée par cette version.

## Reproduire sans appel payant

Depuis un clone cotes-value dont la révision de données est disponible, extraire les trois blobs `opportunites/2026-10-0{5,6,7}.jsonl.gz` et `paris.json` de cette révision. Renommer ce dernier `settlements.json` dans un dossier de données. Les hashes des quatre entrées figurent dans le rapport.

```sh
node scripts/compare-methods.cjs --data-dir /chemin/archives --out /tmp/comparison.json --source-revision 7fed7e82988c55e3082226626818081508067ddc
```

Le notebook [method-audit.ipynb](method-audit.ipynb) reprend le profil et le replay. Les tests vérifient notamment l’absence de fuite de résultats, les doublons de référence, les horodatages, les identités, le retrait de l’avantage nominal, les grosses cotes et la conservation des preuves.
