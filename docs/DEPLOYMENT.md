# Publication sur Vercel

La version utilise **la méthode de décision CoteScope robuste** sur **les prix publiés par cotes-value**. Le scanner et le journal local n’ont besoin ni de clé PulseScore, ni de Neon, ni d’un nouveau cron. La synchronisation Neon est disponible avec le schéma à jour. Les secrets et la fréquence de collecte de cotes-value restent inchangés.

## Projet Vercel existant

1. Publier les changements de ce dépôt sur GitHub.
2. Dans Vercel, ouvrir le projet lié à `Matttgic/Cotescope`. Vérifier que sa branche de production correspond à la branche contenant la refonte.
3. Redéployer cette révision. `vercel.json` définit Next.js, `npm ci`, la compilation et `DEFAULT_DATA_SOURCE=cotescope`. Vérifier les éventuels réglages du projet qui peuvent surcharger ce défaut. Node 24 est indiqué dans `package.json`.
4. Ouvrir le site : **CoteScope** doit être sélectionné. Si le flux est indisponible ou ancien, l’interface affiche une erreur ou une liste vide. **Cotes-value** reste disponible pour l’ancienne règle de sélection.

## Premier projet, y compris depuis Android

Ouvrir [vercel.com/new](https://vercel.com/new) dans le navigateur, connecter GitHub, sélectionner `Matttgic/Cotescope`, choisir Next.js et publier la branche contenant la refonte. Aucun secret n’est nécessaire pour le flux public. Si une branche de revue est utilisée, vérifier son aperçu avant de la choisir comme branche de production.

## Vérifications après publication

- `/api/health` répond en HTTP 200.
- `/api/opportunities` et `/api/cotescope` renvoient `source: "cotescope"`, `demo: false` et des diagnostics de rejet quand le fichier public est disponible. Une réponse 502 signale une erreur de source, pas une panne Neon.
- Les cinq onglets, les images et les filtres fonctionnent sur téléphone.
- Le bouton **Démo** donne des exemples explicitement séparés ; un rechargement retourne à la source de déploiement.
- Une prise ajoutée au journal personnel persiste dans le même navigateur. Le journal du cloud de travail ne se transfère pas automatiquement vers le domaine Vercel : le stockage local dépend du navigateur et du domaine.

## Synchronisation Neon optionnelle

Créer ou réutiliser une base Neon, appliquer `neon/migrations/0001_bet_history.sql` puis `0002_capture_and_partial_settlement.sql`, ajouter sa connexion comme secret serveur `DATABASE_URL` dans Vercel, puis redéployer. Contrôler `/api/tracker/health` : il doit indiquer une base connectée, la colonne des captures et les demi-règlements disponibles. Ne pas coller la connexion dans une conversation ou dans Git.

Chaque appareil doit utiliser la même clé privée de synchronisation via **Paramètres → Synchronisation**. Exporter ses prises avant d’importer une autre identité. En l’absence de Neon, le journal reste local et exportable.

## Collecte et historique

Les relevés de plus de 15 minutes et les matchs commencés sont exclus. La fréquence réelle de publication du collecteur doit être surveillée ; l’absence de signal récent peut produire une liste vide. Aucun workflow ni budget PulseScore n’est modifié par cette publication.

Le mode **Live** conserve les endpoints historiques The Odds API, qui exigent Neon, `THE_ODDS_API_KEY` et `CRON_SECRET`. Le workflow de ce dépôt appelle désormais uniquement la simulation paper et ne planifie plus cette collecte payante. Le collecteur cotes-value n’est pas modifié.

## Test automatique de 1 000 € virtuels

Le test demande la base Neon déjà configurée, les migrations `0001` puis `0002`, et **le même `CRON_SECRET`** dans les variables serveur Vercel et dans **GitHub → Matttgic/Cotescope → Settings → Secrets and variables → Actions**. Redéployer après ajout dans Vercel. Il ne demande aucune nouvelle clé PulseScore.

Le workflow **CoteScope Paper Simulation** appelle `/api/cron/paper`, puis relance le prochain passage cinq minutes après son début avec le jeton GitHub Actions intégré et la permission `actions: write`. Le cron horaire sert de secours si la chaîne s’arrête ; GitHub peut encore retarder les démarrages. Le groupe de concurrence conserve un seul cycle actif. Le workflow se déclenche aussi à la publication des fichiers paper et dispose de **Run workflow**. Pour arrêter les cycles, définir la variable de dépôt `PAPER_AUTO=non`. Un secret absent fait échouer la prise, sans aucun appel payant à PulseScore.

Vérifier `/api/paper` : réponse 200, `simulation: true`, `cronConfigured: true` puis `state.lastCycleAt` non nul pour chacun des trois portefeuilles (`cotescope`, `cotescope-balanced`, `cotes-value`). La présence du secret seule ne prouve pas que la planification fonctionne. Le workflow attend que l’endpoint expose l’équilibré avant de lancer le premier cycle de cette version. Les campagnes existantes conservent leurs données ; l’équilibré commence à 1 000 € à sa propre date, sans reprise des anciens paris et sans nouvelle migration ou nouveau secret. Dans **Performance → Test automatique**, le dernier succès, les mises réservées et les résultats sont visibles ; une alerte apparaît après 20 minutes sans cycle réussi. Voir [PAPER.md](PAPER.md) pour le protocole et ses limites.

La clé PulseScore entrée dans l’environnement de travail n’est pas automatiquement copiée dans Vercel. Elle n’est pas nécessaire pour la première version fondée sur les fichiers publics. Son diagnostic local n’est pas inclus dans le déploiement.
