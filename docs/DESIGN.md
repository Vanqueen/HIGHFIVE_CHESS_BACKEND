# Design system et direction artistique

> Document vivant. Décrire les décisions réelles du produit, pas des préférences génériques.

## Remarque sur ce document
Ce projet est une API backend sans interface utilisateur (voir `docs/PROJECT.md`). Les sections « Identité », « Tokens visuels » et « Interactions » ci-dessous, pensées pour un frontend, ne s'appliquent donc pas et sont marquées **Non applicable**. Le design system visuel du produit (couleurs, typographies, composants UI) est documenté dans le projet frontend voisin : `HIGHFIVE_CHESS_CLIENT/docs/DESIGN.md`. La section « Conventions d'API » ci-dessous remplace, pour ce projet, l'équivalent d'un design system : les règles de forme et de cohérence des réponses HTTP.

## Identité
- Positionnement du produit : Non applicable (pas d'UI dans ce dépôt).
- Public : Non applicable.
- Ton visuel : Non applicable.
- Impression à transmettre : Non applicable.
- Références approuvées : Non applicable.
- Styles à éviter pour CE produit : Non applicable.

## Tokens visuels
- Couleurs principales (hex) : Non applicable.
- Couleurs de surface : Non applicable.
- Couleurs de texte : Non applicable.
- Couleurs d'état : Non applicable.
- Typographies et rôles : Non applicable.
- Échelle typographique : Non applicable.
- Espacements : Non applicable.
- Rayons : Non applicable.
- Bordures / ombres : Non applicable.
- Grille et largeur de contenu : Non applicable.

## Composants existants
- Boutons / Champs / Navigation / Tableaux / Modales / Graphiques : Non applicable (pas de composants visuels dans ce dépôt).
- Équivalent backend — conventions de réponse et d'erreur réutilisées dans tous les contrôleurs (`src/controller/`) :
  - Erreurs HTTP centralisées via la classe `HttpError` (`src/service/errorService.ts`) : porte un `code`/`status`/`statusCode` HTTP et un booléen `success`, remontée par `rethrowServiceError` depuis les services vers le middleware d'erreur (`src/middlewares/error.middleware.ts`).
  - Validation d'entrée mutualisée dans `src/controller/controller.utils.ts` : `readParamId` (identifiant numérique positif dans l'URL), `readBody` (corps JSON objet), `readString`, `readPositiveInteger` — chacune lève une `HttpError` avec un code `422` et un message en français si la valeur est invalide.
  - Autorisation mutualisée : `requireCurrentUser` (401 si non authentifié) et `requireAdmin` (403 si rôle différent de `ADMIN`), toutes deux basées sur `response.locals.user` posé par le middleware d'authentification.
  - Sérialisation : `serializeBigInts` convertit récursivement les `BigInt` (identifiants Prisma) en chaînes avant envoi en réponse JSON.
- Notifications : gérées côté serveur par `src/service/notificationService.ts` et diffusées via WebSocket (`src/events/notification.broadcast.ts`), pas de composant visuel associé dans ce dépôt (le rendu est à la charge du frontend).

## Interactions
- Durées et types de transitions / États hover-focus-disabled / `prefers-reduced-motion` / Règles mobile : Non applicable (pas d'UI).

## Décisions
Pour chaque décision importante, noter le choix, la raison et les pages concernées.
- **Erreurs HTTP typées et centralisées** (`HttpError` + `rethrowServiceError`) — tous les contrôleurs et services. Garantit un format d'erreur homogène (`code`, `status`, `statusCode`, `success`, message en français) consommé par le middleware d'erreur global.
- **Validation d'entrée systématique via des helpers partagés** (`controller.utils.ts`) plutôt qu'une bibliothèque de schéma dédiée (type `zod`/`valibot`) — tous les contrôleurs. À noter : `valibot` figure dans les `overrides` de `package.json` sans être une dépendance directe utilisée dans `src/controller/` à ce jour (voir `docs/DECISIONS.md`).
