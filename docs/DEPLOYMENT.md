# Publication sur Vercel

La première version utilise **le flux public cotes-value** et **le journal local**. Elle n’a besoin ni de la clé PulseScore, ni de Neon, ni d’un nouveau cron. Les fichiers publiés du collecteur existant sont lus ; les secrets et la fréquence de collecte de cotes-value restent inchangés.

## Projet Vercel existant

1. Publier les changements de ce dépôt sur GitHub.
2. Dans Vercel, ouvrir le projet lié à `Matttgic/Cotescope`. Vérifier que sa branche de production correspond à la branche contenant la refonte.
3. Redéployer cette révision. `vercel.json` définit Next.js, `npm ci`, la compilation et `DEFAULT_DATA_SOURCE=cotes-value`. Node 24 est indiqué dans `package.json`.
4. Ouvrir le site : **Cotes-value** doit être sélectionné. Si le flux est indisponible ou ancien, l’interface doit afficher une erreur ou une liste vide ; elle ne passe pas automatiquement en démo.

## Premier projet, y compris depuis Android

Ouvrir [vercel.com/new](https://vercel.com/new) dans le navigateur, connecter GitHub, sélectionner `Matttgic/Cotescope`, choisir Next.js et publier la branche contenant la refonte. Aucun secret n’est nécessaire pour le flux public. Si une branche de revue est utilisée, vérifier son aperçu avant de la choisir comme branche de production.

## Vérifications après publication

- `/api/health` répond en HTTP 200.
- `/api/opportunities` renvoie `source: "cotes-value"` et `demo: false` quand le fichier public est disponible. Une réponse 502 signale une erreur de source, pas une panne Neon.
- Les cinq onglets, les images et les filtres fonctionnent sur téléphone.
- Le bouton **Démo** donne des exemples explicitement séparés ; un rechargement retourne à la source de déploiement.
- Une prise ajoutée au journal personnel persiste dans le même navigateur. Le journal du cloud de travail ne se transfère pas automatiquement vers le domaine Vercel : le stockage local dépend du navigateur et du domaine.

## Synchronisation Neon optionnelle

Créer ou réutiliser une base Neon, appliquer `neon/migrations/0001_bet_history.sql` puis `0002_capture_and_partial_settlement.sql`, ajouter sa connexion comme secret serveur `DATABASE_URL` dans Vercel, puis redéployer. Contrôler `/api/tracker/health` : il doit indiquer une base connectée, la colonne des captures et les demi-règlements disponibles. Ne pas coller la connexion dans une conversation ou dans Git.

Chaque appareil doit utiliser la même clé privée de synchronisation via **Paramètres → Synchronisation**. Exporter ses prises avant d’importer une autre identité. En l’absence de Neon, le journal reste local et exportable.

## Collecte et historique

Les relevés de plus de 15 minutes et les matchs commencés sont exclus. La fréquence réelle de publication du collecteur doit être surveillée ; l’absence de signal récent peut produire une liste vide. Aucun workflow ni budget PulseScore n’est modifié par cette publication.

Le mode **Live** conserve le collecteur historique The Odds API, qui exige Neon, `THE_ODDS_API_KEY` et `CRON_SECRET`. Le workflow existant cible `https://cotescope.vercel.app` ; vérifier cette adresse et les secrets avant de l’utiliser. Il est distinct du mode par défaut cotes-value et du contrôle PulseScore limité à une requête.

La clé PulseScore entrée dans l’environnement de travail n’est pas automatiquement copiée dans Vercel. Elle n’est pas nécessaire pour la première version fondée sur les fichiers publics. Son diagnostic local n’est pas inclus dans le déploiement.
