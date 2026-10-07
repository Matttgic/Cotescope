# Refonte CoteScope — analyse et choix

Dépôts examinés : CoteScope et Matttgic/cotes-value, sans modifier le moteur Python.

## Ce que cotes-value fait déjà mieux

Son moteur couvre de nombreux marchés, rapproche événements et périodes, retire la marge par méthode power, compare plusieurs références, contrôle les traductions, simule des tranches d’EV disjointes et conserve des preuves de prise et de règlement. Les 72 tests existants ont passé dans cet environnement. Réécrire tout ce moteur sans données de validation aurait créé un risque de régression.

La refonte utilise son flux publié en lecture seule et prépare un contrôle PulseScore direct limité à une requête explicite. Aucune collecte supplémentaire ne démarre automatiquement. Les workflows de cotes-value restent inchangés.

## Corrections

- Le mode démo annoncé renvoyait une erreur de base non configurée. Il possède maintenant un contrat explicite et des EV cohérentes avec les prix.
- Changer un filtre enregistrait automatiquement des paris. Chaque prise est maintenant volontaire ; les simulations sont séparées des prises réelles et ne partent jamais au cloud.
- Le tracker associait chaque identité aux détections partagées et autorisait leur suppression. Les lectures et suppressions personnelles sont maintenant limitées au propriétaire. Les crons continuent à traiter les détections serveur.
- Les dates invalides étaient considérées comme fraîches et le garde-fou grosses cotes était forcé à vrai. Dates invalides, futures, périmées et matchs commencés sont écartés ; le garde-fou est recalculé.
- Le provider attribuait des constantes de consensus, stabilité et liquidité non observées. Le nouveau score ne récompense plus ces données absentes. Il note l’EV (35), la référence reconnue (20), la fraîcheur (20), le marché vérifié (20) et un consensus documenté (5). C’est une heuristique, pas une probabilité. Le score du cache est plafonné par le score enregistré.
- Les marchés H2H incomplets, dupliqués, avec des sélections différentes ou une référence à marge excessive sont écartés. La méthode power retire la marge. La fraîcheur du marché et du bookmaker utilise la plus ancienne de leurs dates.
- Le ROI du journal personnel utilise les mises gagnées et perdues. Les paris ouverts et remboursés ne gonflent pas son dénominateur. La courbe suit les paris réglés par date d’enregistrement ; aucune date exacte de règlement n’est fabriquée.
- Le journal valide ses données locales, conserve les mises à jour récentes, protège les champs textuels du CSV contre les formules et conserve les suppressions cloud à réessayer. Importer une identité ne transfère pas automatiquement les prises d’une autre identité.

## Flux cotes-value

L’API lit `opportunites_actuelles.json` de la branche `donnees`. Elle regroupe chaque cote française par bookmaker, match, marché, période, ligne et issue. Elle préfère le consensus disponible, puis Pinnacle, sans choisir artificiellement la référence qui maximise l’EV.

Les marchés canoniques conformes sont raccordés : résultats, handicaps asiatiques et européens, totaux (équipe, jeux, sets ou corners), double chance, nul remboursé, score exact, les deux équipes marquent et mi-temps/fin. Les périodes inconnues ou ambiguës, issues invalides et lignes non numériques ou hors quart de point sont rejetées. L’identité conserve marché, période, ligne, issue et joueur. La double chance reprend la probabilité publiée, sans normaliser ses issues qui se recouvrent.

Les marchés avec remboursement possible n’utilisent pas le Kelly binaire ni une espérance inconditionnelle en euros. Les lignes au quart de point peuvent se régler en demi-gain ou demi-perte. Le journal personnel prend maintenant en charge ces statuts ; la migration 0002 étend son contrat cloud et ajoute les captures de prix. Les anciennes prises sont conservées.

Le bilan du moteur utilise le fichier actif `paris.json`, pas les archives mensuelles. La vue unique choisit la première détection avant les filtres et exclut le témoin brut. Le ROI simulé inclut les remboursements et demi-règlements dans les mises réglées. Les gains incompatibles avec le statut sont exclus ; les preuves absentes ne sont pas inventées. Chaque simulation conserve dans la réponse les preuves publiées de prise et de règlement.

La CLV est recalculée (`cote / cote_juste_cloture − 1`) et comparée à la valeur publiée (tolérance 0,1 point de pourcentage). Elle exige un statut réglé, un début passé et des horodatages avec fuseau situant le relevé dans les 30 minutes strictement avant le début. Sa moyenne est non pondérée et affiche sa couverture sur les paris réglés. Les horaires de clôture antérieurs au 7 octobre 2026 peuvent correspondre au cycle du collecteur.

Les témoins Pinnacle brut, marchés suspects, données invalides, références inconnues, désaccords supérieurs à 25 %, prix vieux de plus de 15 minutes et matchs commencés sont écartés. Les règles de règlement restent à contrôler ; les données de composition publiées ne reconstituent pas toutes les preuves du moteur Python.

Une réponse HTTP 200 du flux réel a été vérifiée. Les signaux évoluent à chaque cycle. Une erreur réseau reste visible et ne devient jamais une démo implicite. La console n’écrit pas sur la branche donnees.

## Preuves et accès direct PulseScore

La prise conserve une capture des cotes, de l’écart, de la période/ligne et des preuves disponibles. Le client conserve cette capture après les modifications de mise ou de statut ; l’UPSERT SQL ne remplace pas une capture déjà présente. Un export JSON conserve toutes ces données sans exporter la clé de synchronisation. Les prises antérieures sans capture ne sont pas reconstruites.

Le CLI `pulse:check` exige `PULSESCORE_KEY` et `--allow-paid` pour émettre exactement une tentative sur une page de 30 événements, sans réessai ni pagination. L’origine HTTPS est fixe ; la clé est dans l’en-tête, jamais dans l’URL, les diagnostics ou le navigateur. Les erreurs réseau et les réponses d’erreur sont réduites à des codes stables. Les diagnostics distinguent présence de la clé, succès HTTP, suspension/live et absence d’horodatages de prix. Une heure de téléchargement n’est pas assimilée à une heure de mise à jour des cotes.

Le règlement automatique existant sélectionnait et modifiait aussi les prises personnelles partageant un identifiant `v2`. Ses lectures et mises à jour sont désormais limitées au propriétaire des détections serveur. Cette isolation, la migration répétée, la compatibilité des anciennes lignes et l’immutabilité des captures sont testées sur PostgreSQL embarqué.

## Ce que les tests démontrent

Les régressions couvrent les calculs, marchés incomplets, horodatages, choix du consensus, séparation démo/live, journal et isolation des requêtes cloud. Les parcours navigateur couvrent filtres, ajout volontaire, règlement, ROI, persistance, export, calculateur, paramètres, erreurs de source et formats mobile/tablette/ordinateur. Ils vérifient aussi les onglets au clavier, la conservation des filtres entre les rubriques, l’isolation de la synthèse et des paramètres, et une navigation visible dans un écran de 320, 390 ou 768 pixels avec défilement limité au contenu actif.

Ces validations démontrent un fonctionnement plus cohérent ; elles ne démontrent pas un rendement supérieur. Le replay exploratoire de [METHOD.md](METHOD.md) sélectionne chronologiquement avant de joindre les résultats, mais sa couverture présélectionnée et son unique prise CoteScope réglée ne constituent pas un backtest indépendant. Aucun intervalle de confiance de rentabilité n’est revendiqué. La CLV ne s’affiche pas sans vraie cote de clôture vérifiable. Les tests couvrent les limites de temps, doubles chances, lignes au quart de point, filtres après déduplication, gains partiels et le moteur robuste.

## Limites restantes

- Le premier contrôle PulseScore authentifié a réussi le 7 octobre 2026 : une requête Winamax/football, 30 matchs, aucune pagination supplémentaire. Ce contrôle ne prouve ni le niveau d’abonnement, ni la couverture de tous les sports, ni la fraîcheur des prix. Aucun nouveau contrôle payant n’est nécessaire pour la méthode robuste. Après application de la migration 0002, Neon a été vérifié en production par enregistrement, relecture, demi-règlement, immutabilité de capture et isolation entre deux identités techniques ; l’entrée temporaire a été supprimée. Les appels authentifiés à The Odds API restent non testés.
- Le flux multi-référence dépend du fichier public GitHub et de sa mise à jour. Son état peut changer après validation.
- Les crons existants règlent seulement les identifiants du moteur CoteScope. Les prises du flux cotes-value sont réglées manuellement dans cette console.
- Les demi-règlements sont calculés dans le bilan et le journal. La synchronisation des nouveaux statuts et des preuves nécessite la migration 0002 sur Neon. Les corrélations, limites opérateurs et commissions ne sont pas modélisées par les simulateurs de mise.
- Le bilan est limité au fichier actif publié ; ce n’est pas une performance sur tout l’historique. La provenance des scores peut manquer dans les anciennes simulations.
- Les anciennes prises automatiquement enregistrées dans le navigateur sont conservées ; leur présence ne prouve pas qu’un pari a été placé.
- Une clé de synchronisation donne accès au journal. Aucun nouveau système de comptes utilisateurs n’a été ajouté.
