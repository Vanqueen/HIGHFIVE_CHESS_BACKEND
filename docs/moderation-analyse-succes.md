# Modération, analyse et succès

## Signalements

Toutes les routes sont authentifiées et montées sous `/api/reports`.

| Méthode | Route | Accès | Fonction |
| --- | --- | --- | --- |
| `POST` | `/` | Utilisateur | Signaler un utilisateur, une partie ou un message |
| `GET` | `/me?limit=50` | Utilisateur | Consulter ses signalements |
| `GET` | `/?status=PENDING&limit=50` | Administrateur | Consulter la file de revue |
| `PATCH` | `/:reportId` | Administrateur | Passer en revue, résoudre ou rejeter |

Les motifs sont `CHEATING`, `HARASSMENT`, `INSULT`, `SPAM`,
`INAPPROPRIATE_CONTENT`, `FAKE_ACCOUNT` et `OTHER`. Le corps de création
contient `reason`, et au moins l'un de `reportedUserId`, `gameId` ou
`messageId`; une partie ou un message ne peut être ciblé simultanément.
Seul un participant peut signaler une partie ou un message de cette partie.
Pour un message, l'auteur devient l'utilisateur signalé. L'utilisateur ne peut
pas se signaler lui-même.

La revue accepte `UNDER_REVIEW`, `RESOLVED` ou `REJECTED`, avec une
`resolutionNote` facultative. Les signalements clos ne peuvent pas être rouverts
ou modifiés; la mise à jour conditionne le statut précédent afin de rejeter les
revues concurrentes.

## Analyses Stockfish

Le worker traite les parties terminées, enregistre la position et la ligne
principale pour les coups, puis l'évaluation et la meilleure ligne de la
position finale. Les données détaillées sont persistées dans `analysisData`.
Une contrainte unique `(gameId, engine)` rend le stockage idempotent par moteur.

| Méthode | Route | Accès | Fonction |
| --- | --- | --- | --- |
| `GET` | `/api/games/:gameId/analysis` | Participant | Lire l'analyse ou voir `PENDING` |
| `POST` | `/api/games/:gameId/analysis` | Participant | Demander l'analyse d'une partie terminée |

Le serveur doit être configuré avec `STOCKFISH_PATH` vers un exécutable
Stockfish local compatible UCI. `STOCKFISH_DEPTH` est optionnel (défaut 10,
valeurs acceptées de 1 à 20). Le worker analyse au plus les 200 derniers demi-coups, avec
une durée bornée par position; les échecs sont consignés puis réessayés.
Sans exécutable configuré, les routes de lecture répondent `503` si l'analyse
n'est pas encore disponible.

Le worker parcourt les parties sans analyse persistée; son état n'est pas gardé
en mémoire comme seule file de travail. La contrainte unique en base protège
les traitements lancés par plusieurs instances.
Un échec d'analyse est retenté après cinq minutes. Les écritures de dates
`timestamptz` utilisent des `Temporal.Instant`, conformément au contrat de base.

### Installer et vérifier Stockfish

1. Télécharger une version Windows depuis le site officiel
   [stockfishchess.org](https://stockfishchess.org/download/) et choisir le
   binaire adapté aux instructions processeur de la machine. Extraire
   l'exécutable dans un emplacement stable accessible au compte qui exécute le
   serveur.
2. Dans `server/.env.development` ou le fichier d'environnement du déploiement,
   définir le chemin absolu et la profondeur, par exemple :

   ```dotenv
   STOCKFISH_PATH="C:\tools\stockfish\stockfish-windows-x86-64-avx2.exe"
   STOCKFISH_DEPTH=10
   ```

   Le chemin doit désigner l'exécutable Stockfish, pas son dossier. Vérifier
   que le compte du service a le droit de lecture et d'exécution.
   Pour un essai temporaire dans PowerShell, définir
   `$env:STOCKFISH_PATH` et `$env:STOCKFISH_DEPTH`, puis lancer
   `npm.cmd run stockfish:check` depuis `server`.
3. Depuis le dossier `server`, lancer `npm run stockfish:check`. Cette commande
   démarre le moteur via UCI, vérifie `uciok`/`readyok`, puis demande un coup
   sur la position initiale. Elle ne requiert pas PostgreSQL. Un code de sortie
   non nul indique un chemin, une profondeur ou un moteur invalide.
4. Pour lancer manuellement une analyse depuis le serveur sur une partie
   terminée, utiliser son ID :

   ```bash
   NODE_ENV=production npm run stockfish:analyze -- 123
   ```

   Sous PowerShell, définir d'abord `$env:NODE_ENV = "production"`, puis
   lancer `npm.cmd run stockfish:analyze -- 123`. La commande utilise la base
   choisie par `NODE_ENV`, requiert `STOCKFISH_PATH`, n'analyse que les parties
   terminées et ne relance pas une analyse déjà persistée. Elle ne démarre pas
   le worker périodique. Vérifier l'environnement et la base ciblée avant
   l'exécution; ne pas fournir l'ID d'une partie de production à une commande
   configurée vers une autre base.
5. Pour vérifier le parcours API, démarrer le serveur et demander l'analyse via
   `POST /api/games/:gameId/analysis` avec le jeton d'un participant. La réponse
   initiale peut être `PENDING`; interroger ensuite
   `GET /api/games/:gameId/analysis` jusqu'à `READY` et vérifier la version du
   moteur, la profondeur et les lignes d'analyse persistées.
6. Répéter l'essai dans l'environnement cible. En production, vérifier
   l'exécutable et ses permissions sous l'identité réelle du service ainsi que
   la compatibilité CPU de la build choisie. Chaque instance d'API qui lance le
   worker doit avoir Stockfish configuré et accès à la même base.

## Succès

`GET /api/users/me/achievements` retourne les succès de l'utilisateur. Le
catalogue initial est créé de façon idempotente par `npm run db:seed`; cette
commande ne crée aucun compte utilisateur et peut être exécutée sur une base
de production migrée. Les nouvelles définitions peuvent être administrées
dans le modèle `Achievement`.

Les événements de fin de partie actualisent les parties terminées, victoires,
nuls, classement, et séries de victoires dans la même transaction que les
statistiques. L'acceptation d'une amitié actualise le nombre d'amis; la
finalisation d'un tournoi actualise les participations et victoires de tournoi.
Les progrès restent monotones et chaque couple utilisateur/succès est
persisté de façon idempotente.
