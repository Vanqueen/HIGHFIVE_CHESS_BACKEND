# Décisions techniques et produit

N'ajouter que les décisions durables. Ne pas y enregistrer chaque modification mineure.

## Format
### AAAA-MM-JJ — Titre court
- Contexte :
- Décision :
- Raisons :
- Conséquences / compromis :
- Zones concernées :

### 2026-10-25 — Documentation initiale du dépôt (constat, pas une nouvelle décision)
- Contexte : première initialisation de `docs/PROJECT.md`, `docs/DESIGN.md` et `docs/DECISIONS.md` pour ce backend ; les entrées ci-dessous consignent des décisions déjà prises dans le code existant, repérées lors de cette analyse.
- Décision : documenter ces choix tels qu'implémentés, sans les modifier.
- Raisons : respecter la consigne « ne rien deviner, ne pas refondre » pour cette première étape.
- Conséquences / compromis : les dates ci-dessous sont la date de documentation, pas la date de décision d'origine (inconnue).
- Zones concernées : ensemble du backend `HIGHFIVE_CHESS_BACKEND`.

### 2026-10-25 — Architecture en couches strictes routes → controller → service → repository
- Contexte : chaque domaine métier (auth, jeu, défis, tournois, social, signalements...) suit la même structure : une route Express, un contrôleur qui valide la requête, un service qui porte la logique métier, un repository qui accède à Prisma.
- Décision : conserver cette séparation pour tout nouveau domaine ou endpoint.
- Raisons : cohérence du code existant, testabilité (les services et repositories sont testés indépendamment des routes HTTP, voir les nombreux `*.test.ts` colocalisés).
- Conséquences / compromis : un peu plus de fichiers par fonctionnalité, mais logique métier découplée du framework HTTP.
- Zones concernées : `src/routes/`, `src/controller/`, `src/service/`, `src/repository/`.

### 2026-10-25 — Base de données managée via Prisma 8 + Prisma Composer
- Contexte : `module.ts`/`service.ts` provisionnent une base PostgreSQL via `@prisma/composer-prisma-cloud` (région `us-east-1`) et lient l'app Express construite par `tsdown` ; le contrat de données vit dans `src/prisma/contract.prisma` et les migrations dans `migrations/app/<horodatage>_<nom>`.
- Décision : la gestion du schéma et des déploiements passe par l'outillage Prisma Composer plutôt que par des migrations SQL manuelles ou un autre ORM.
- Raisons : non documentées explicitement dans le code ; le `README.md` racine présente ce flux comme le mode de fonctionnement principal (`npm run dev:composer`, `npm run deploy`).
- Conséquences / compromis : dépendance à des paquets en version pré-release (`@prisma/orm-postgres@8.0.0-rc.12`, `prisma@8.0.0-rc.18`, `alchemy@2.0.0-beta.78`) — risque de changements de comportement lors des mises à jour. Un mode « direct » existe aussi (`npm run dev`, nécessite `DATABASE_URL`) sans passer par Composer.
- Zones concernées : `module.ts`, `service.ts`, `prisma.config.ts`, `prisma-composer.config.ts`, `src/prisma/`, `migrations/`.

### 2026-10-25 — Authentification JWT access/refresh avec hachage argon2id
- Contexte : `src/utils/token.ts` génère des JWT d'accès et de rafraîchissement signés séparément (`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`), avec des durées configurables (`JWT_ACCESS_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN`) ; les mots de passe et les tokens de rafraîchissement persistés sont hachés avec `argon2` (variante `argon2id`).
- Décision : `argon2id` est l'algorithme de hachage de référence pour les mots de passe et les tokens sensibles.
- Raisons : non documentées explicitement ; `argon2id` est un choix reconnu comme robuste contre les attaques GPU/ASIC.
- Conséquences / compromis : `bcryptjs` est utilisé en parallèle dans `src/utils/hash.util.ts` (consommé par `passwordResetService` et `userService`) pour un usage distinct — à clarifier si ce choix est intentionnel (voir `docs/PROJECT.md`, section « À confirmer »).
- Zones concernées : `src/utils/password.ts`, `src/utils/token.ts`, `src/middlewares/auth.middleware.ts`, `src/service/authService.ts`.

### 2026-10-25 — Sécurité HTTP : liste blanche d'origines CORS stricte et en-têtes durcis
- Contexte : `src/config/http-security.config.ts` construit les options CORS à partir de `CLIENT_ORIGINS` (parsées et validées comme origines HTTP/HTTPS strictes, sans utilisateur/mot de passe/chemin/requête/fragment) ; `src/index.ts` applique `helmet()` globalement et désactive l'en-tête `X-Powered-By`.
- Décision : aucune origine n'est acceptée par défaut en production si `CLIENT_ORIGINS` n'est pas défini (liste vide) ; en développement, `http://localhost:5173` est la valeur par défaut.
- Raisons : limiter la surface d'attaque CSRF/CORS en production tout en restant utilisable sans configuration en local.
- Conséquences / compromis : la valeur par défaut de développement (`5173`) ne correspond pas aux ports réellement utilisés par le frontend dans sa configuration actuelle (voir l'incohérence de ports déjà notée dans `HIGHFIVE_CHESS_CLIENT/docs/PROJECT.md`) — à surveiller si les deux projets sont lancés ensemble.
- Zones concernées : `src/config/http-security.config.ts`, `src/index.ts`.

### 2026-10-25 — Gestion centralisée des erreurs HTTP et de la validation d'entrée
- Contexte : `src/service/errorService.ts` définit une classe `HttpError` unique (code/status/statusCode/success) et une fonction `rethrowServiceError` pour convertir toute erreur de service en `HttpError` ; `src/controller/controller.utils.ts` fournit des helpers de validation partagés (`readParamId`, `readBody`, `readString`, `readPositiveInteger`, `requireCurrentUser`, `requireAdmin`).
- Décision : tous les contrôleurs valident leurs entrées et gèrent leurs erreurs via ces helpers communs plutôt que par des vérifications ad hoc ou une bibliothèque de schéma (`zod`/`valibot` ne sont pas utilisées dans `src/controller/` à ce jour malgré la présence de `valibot` dans les `overrides` de `package.json`).
- Raisons : cohérence des réponses d'erreur (messages en français, codes HTTP homogènes) sur l'ensemble de l'API.
- Conséquences / compromis : toute nouvelle validation doit passer par ces helpers (ou les étendre) pour rester cohérente ; pas de schéma déclaratif centralisé décrivant la forme des payloads.
- Zones concernées : `src/service/errorService.ts`, `src/controller/controller.utils.ts`, `src/middlewares/error.middleware.ts`, l'ensemble de `src/controller/`.
