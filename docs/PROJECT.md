# Project context

> À compléter lors de la première exploration du dépôt. Ne pas inventer les informations manquantes.

## Produit
- Nom : le `README.md` racine le nomme simplement « server » ; `package.json` le nomme `highfive_chess_backend` ; une variable d'environnement (`APP_NAME`) le nomme « HIGHFIVE_CHESS » ; `AUTH_COOKIE_NAME` et `EMAIL_FROM` utilisent « highfive_tournament » / « HIGHFIVE Tournament ». Voir incohérence en « À confirmer » (et celle déjà notée côté frontend : titre HTML « CHESSARENA »).
- Objectif principal : API backend du jeu d'échecs en ligne consommé par `HIGHFIVE_CHESS_CLIENT` — gestion des comptes, des parties (classées, amicales, contre invités), des défis, des tournois, du classement (rating), de la messagerie, des notifications, des signalements/modération et de l'analyse de parties (moteur Stockfish).
- Utilisateurs : trois rôles identifiés dans le code (`src/middlewares/auth.middleware.ts`) : `USER`, `ORGANIZER`, `ADMIN`.
- Fonctionnalités principales (déduites de `src/routes/` et de `docs/*.md` déjà présents dans ce dossier) : authentification et mots de passe, comptes/administration, parties et coups, temps réel (WebSocket), défis directs, liens d'invitation, amitiés/blocages/conversations, signalements et succès, analyse de parties via Stockfish, tournois, maintenance des données de coups. Le détail métier de chaque domaine est déjà documenté dans les fichiers voisins de ce dossier (`authentification.md`, `comptes.md`, `parties-et-coups.md`, `temps-reel.md`, `defis.md`, `liens-invitation.md`, `social-et-blocages.md`, `moderation-analyse-succes.md`, `tournois.md`, `maintenance-donnees.md`), ce fichier ne les duplique pas.

## Stack technique
- Framework backend : Node.js (`engines.node`: `^22.18.0 || >=24.11.0`) + Express 5 (`src/index.ts`).
- Langage : TypeScript (compilation stricte, `noEmit: true` en dev via `tsx`, build via `tsdown`).
- Base de données / ORM : PostgreSQL via Prisma 8 (RC) et Prisma Composer (`@prisma/composer`, `@prisma/orm-postgres`), contrat de données dans `src/prisma/contract.prisma`. Provisionnement/déploiement orchestrés par `module.ts` et `service.ts` (Prisma Composer + `@prisma/composer-prisma-cloud`, région `us-east-1`).
- Temps réel : Socket.IO (`socket.io` côté serveur, `socket.io-client` en dev/test), gateway dans `src/websocket/game.gateway.ts`.
- Authentification : JWT (access + refresh, `jsonwebtoken`), hachage des mots de passe et des tokens avec `argon2` (type `argon2id`, `src/utils/password.ts`, `src/utils/token.ts`) ; `bcryptjs` est utilisé séparément dans `src/utils/hash.util.ts` (utilisé par `passwordResetService` et `userService`) — deux bibliothèques de hachage coexistent pour des usages différents, voir « À confirmer ».
- Sécurité HTTP : `helmet`, `cors` (origines contrôlées par `CLIENT_ORIGINS`, validées strictement dans `src/config/http-security.config.ts`), `express-rate-limit` sur les routes d'authentification (`src/middlewares/auth-rate-limit.middleware.ts`), `trust proxy` configurable (`TRUST_PROXY_HOPS`).
- Upload de fichiers : `express-fileupload` (limite 5 Mo, noms de fichiers sécurisés) ; stockage des médias via `cloudinary`.
- Email : `nodemailer` (SMTP), service dans `src/service/emailService.ts`.
- Moteur d'échecs : `chess.js` (règles du jeu) + intégration Stockfish externe (binaire local, chemin configuré par `STOCKFISH_PATH`/`STOCKFISH_DEPTH`) pour l'analyse de parties (`src/service/analyze-game.ts`, `src/service/stockfishAnalysisWorker.ts`).
- Tests : Vitest (`vitest run`), tests unitaires colocalisés (`*.test.ts` dans `src/controller`, `src/service`, `src/middlewares`, `src/config`, `src/utils`, `src/websocket`) et tests d'intégration dédiés (`*.integration.test.ts` dans `src/prisma`, `src/routes`, `src/websocket`). Pas de fichier `vitest.config.*` trouvé (configuration par défaut).
- Build / package manager : npm (`packageManager: npm@11.6.0`), build via `tsdown` (bundle ESM ciblant Node 22.18).

## Architecture
- Point d'entrée HTTP/WebSocket : `src/index.ts` (configure Express, CORS, Helmet, upload, monte les routes `/api/*`, attache la gateway WebSocket, démarre les workers).
- Point d'entrée Prisma Composer (déploiement/dev managés) : `module.ts` (provisionne la base Postgres puis l'app) et `service.ts` (lie l'app Express au build Composer, `dist/server.mjs`).
- Dossier des routes : `src/routes/` (une route Express par domaine : `auth`, `game`, `challenges`, `invitation-links`, `tournaments`, `users`, `social`, `conversations`, `reports`).
- Dossier des contrôleurs : `src/controller/` (validation/forme des requêtes HTTP, un contrôleur par domaine + `controller.utils.ts`).
- Dossier des services : `src/service/` (logique métier : jeu, défis, tournois, rating, chat, notifications, réinitialisation de mot de passe, email, modération, achievements, analyse Stockfish, présence utilisateur, workers planifiés).
- Dossier des accès aux données : `src/repository/` (une couche repository par modèle Prisma : `user`, `game`, `move`, `tournament`, `rating`, `friendship`, `conversation`, `notification`, `report`, `achievement`, etc.).
- Dossier WebSocket : `src/websocket/` (`game.gateway.ts` pour la connexion/les événements de partie, `socket-presence.registry.ts` pour la présence en ligne) + `src/events/` (définitions d'événements : jeu, chat, matchmaking, notifications, messages).
- Dossier des middlewares : `src/middlewares/` (authentification, limitation de débit sur l'auth, gestion centralisée des erreurs).
- Dossier de configuration : `src/config/` (chargement de l'environnement, sécurité HTTP/CORS, configuration WebSocket).
- Dossier Prisma : `src/prisma/` (contrat `contract.prisma`/`contract.json`/`contract.d.ts`, connexion `db.ts`, seed `seed.ts` — avec un doublon `seed copy.ts`, voir « À confirmer », scripts de bootstrap admin et de backfill de données).
- Dossier utilitaires : `src/utils/` (hachage mots de passe/tokens, JWT, dates (`temporal-polyfill`), Cloudinary, email, catégories de rating, couleur des pièces).
- Dossier des tests : pas de dossier séparé ; les tests sont colocalisés avec le code qu'ils couvrent (convention `*.test.ts` / `*.integration.test.ts`).
- Migrations : `migrations/app/<horodatage>_<nom>` (historique des migrations Prisma Composer) + `migrations/snapshots/` (snapshots de schéma référencés par hash).

## Commandes validées
- Installation : non exécutée pendant cette analyse ; `package-lock.json` présent, donc `npm install`/`npm ci` est l'outil attendu (à confirmer en l'exécutant).
- Développement : `npm run dev` → `tsx watch --trace-warnings src/index.ts` (nécessite `DATABASE_URL` défini). Alternative orchestrée par Composer : `npm run dev:composer` (build puis `prisma dev module.ts`, décrit dans `README.md`).
- Lint : aucun script `lint` défini dans `package.json` (pas d'ESLint configuré côté backend, contrairement au frontend).
- Tests : `npm test` → `vitest run`.
- Build : `npm run build` → `tsdown`.
- Autres commandes notables définies dans `package.json` (non exécutées pendant cette analyse) : `npm run db:push`, `npm run db:seed`, `npm run migrate`, `npm run contract:emit`, `npm run admin:bootstrap`, `npm run stockfish:check`, `npm run deploy`.

## Contraintes
- Compatibilité : version Node explicite (`^22.18.0 || >=24.11.0`) imposée par `engines.node`.
- Sécurité réseau : CORS strict par liste blanche d'origines (`CLIENT_ORIGINS`), en-têtes de sécurité via `helmet`, limite de taille des requêtes JSON (1 Mo) et des fichiers uploadés (5 Mo), `trust proxy` explicite (défaut 0).
- Authentification : jetons JWT access/refresh à durée de vie configurable (`JWT_ACCESS_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN` dans les fichiers d'environnement), limitation de débit dédiée sur les routes `/api/auth`.
- Dépendances en version pré-release : `@prisma/orm-postgres` (`8.0.0-rc.12`), `prisma` (`8.0.0-rc.18`), `alchemy` (`2.0.0-beta.78`) — risque de changements de comportement entre mises à jour.
- Conventions spécifiques : architecture en couches stricte routes → controller → service → repository ; chaque module Prisma Composer (`module.ts`, `service.ts`) encapsule le binding base de données/app.
- Accessibilité / performance : non applicable (pas d'interface utilisateur dans ce projet).

## À confirmer
Ne conserver ici que les questions réellement non résolues.
- **Nom du produit incohérent selon les sources** : « server » (README), `highfive_chess_backend` (package.json), « HIGHFIVE_CHESS » (`APP_NAME`), « highfive_tournament »/« HIGHFIVE Tournament » (cookie d'auth, expéditeur email), « CHESSARENA » (frontend). Quel est le nom officiel du produit ?
- **Double bibliothèque de hachage** : `argon2` (mots de passe et tokens, `src/utils/password.ts`, `src/utils/token.ts`) coexiste avec `bcryptjs` (`src/utils/hash.util.ts`, utilisé par `passwordResetService` et `userService`). Est-ce intentionnel (usages différents) ou une migration inachevée vers `argon2` ?
- **Fichier « copy »** : `src/prisma/seed copy.ts` existe en plus de `src/prisma/seed.ts`. Brouillon à supprimer ou variante encore utile ?
- **Pas de script `lint`** : contrairement au frontend, aucun outil de lint n'est configuré pour ce projet. Choix délibéré ou chantier à ouvrir ?
- **Secrets en clair détectés localement** : `.env.test` et `.env.production` contiennent des identifiants qui ressemblent à de vrais secrets (connexion PostgreSQL Prisma, mot de passe d'application SMTP Gmail, clé Cloudinary, secrets JWT, mot de passe Redis). Ces fichiers sont bien exclus de git (`.gitignore` + vérifié via `git ls-files`), donc pas de fuite dans l'historique, mais à vérifier/rotater s'il s'agit d'identifiants réels.
