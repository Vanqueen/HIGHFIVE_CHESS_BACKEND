# Authentification et mots de passe

Les routes sont montées sous `/api/auth`. Les services portent les règles
métier et utilisent les repositories pour les accès aux données et les
transactions de compte.

## Routes

| Méthode | Route | Accès | Fonction |
| --- | --- | --- | --- |
| `POST` | `/register` | Public | Créer un compte |
| `POST` | `/admin/users` | Administrateur | Créer un compte administrateur ou organisateur |
| `POST` | `/login` | Public | Ouvrir une session |
| `POST` | `/refresh` | Public avec refresh token | Renouveler les tokens |
| `POST` | `/logout` | Authentifié | Fermer la session |
| `POST` | `/unlock/:userId` | Administrateur | Déverrouiller un compte |
| `POST` | `/password/forgot` | Public | Demander un code de réinitialisation |
| `POST` | `/password/verify-reset-code` | Public | Vérifier le code |
| `POST` | `/password/reset` | Public avec code | Définir un nouveau mot de passe |
| `POST` | `/password/change` | Authentifié | Changer le mot de passe avec l’ancien |

Les formes des corps de requête et les réponses sont définies dans les
contrôleurs [`auth.controller.ts`](../../server/src/controller/auth.controller.ts)
et
[`passwordReset.controller.ts`](../../server/src/controller/passwordReset.controller.ts).

## Règles principales

- Les access tokens sont validés contre l’utilisateur et sa session active ;
  les comptes supprimés, suspendus, inactifs ou verrouillés ne sont pas
  autorisés.
- Les refresh tokens sont stockés sous forme de hash et leur rotation est
  contrôlée par le repository.
- La création de session et de refresh token est transactionnelle ; la règle
  actuelle est une session active par compte.
- L'inscription publique crée toujours un compte `USER`, même si un champ
  `role` est envoyé. Seul un administrateur authentifié peut créer un compte
  `ADMIN` ou `ORGANIZER` via `/admin/users`, avec `username`, `email`,
  `password` et `role` dans le corps JSON.

Exemple de corps pour `POST /api/auth/admin/users` :

```json
{
  "username": "organisateur",
  "email": "organisateur@example.com",
  "password": "MotDePasseTemporaire123",
  "role": "ORGANIZER"
}
```

## Amorçage du premier administrateur

La création du premier compte administrateur se fait hors ligne, par une
commande CLI, jamais via l'inscription publique :

```powershell
npm run admin:bootstrap -- --env development
```

Remplacer `development` par l'environnement voulu (`test`, `staging` ou
`production`). Les options `--email` et `--username` sont facultatives; si elles
sont omises, la commande les demande. Le mot de passe est toujours saisi deux
fois sans affichage et n'est pas accepté comme argument. Avant toute écriture,
la commande affiche l'hôte et le nom de la base sans identifiants, puis exige
la confirmation exacte `BOOTSTRAP <environnement>`.

Le bootstrap prend un verrou PostgreSQL transactionnel, refuse de créer un
deuxième administrateur et annule si le courriel ou le pseudo existe déjà.
Appliquer les migrations avant de l'exécuter. Répéter l'opération
indépendamment pour chaque base qui doit avoir son propre premier
administrateur. La commande charge `.env` puis `.env.<environnement>` depuis le
dossier `server`; toute variable d'environnement déjà fournie, notamment
`DATABASE_URL`, reste prioritaire. Vérifier la base affichée avant de confirmer.

Après le premier login, créer les autres administrateurs ou organisateurs par
`POST /api/auth/admin/users`. `npm run db:seed` initialise uniquement le
catalogue des succès et ne crée pas d'administrateur; utiliser
`npm run admin:bootstrap` pour créer le premier admin.

- `changePassword` exige une session et l’ancien mot de passe. `resetPassword`
  suit le parcours distinct de code à usage unique.
- Les erreurs métier sont levées par les services puis transformées en
  réponses HTTP par le middleware Express.
- Les routes d’authentification sont protégées par des limites de débit par IP ;
  les protections HTTP, CORS, seuils et exigences de reverse proxy sont
  documentés dans [`protections-http.md`](./protections-http.md).

## Code

- Routes : [`auth.ts`](../../server/src/routes/auth.ts)
- Services : [`authService.ts`](../../server/src/service/authService.ts),
  [`passwordResetService.ts`](../../server/src/service/passwordResetService.ts)
- Repositories : `account.repository.ts`, `session.repository.ts`,
  `refresh-token.repository.ts`, `password-reset-code.repository.ts`
- Middleware : [`auth.middleware.ts`](../../server/src/middlewares/auth.middleware.ts)
