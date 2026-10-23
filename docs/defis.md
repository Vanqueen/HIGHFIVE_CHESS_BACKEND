# Défis directs entre joueurs

Les routes sont montées sous `/api/challenges` et exigent une authentification.
Le créateur du défi choisit le contrôle du temps. Aucun champ supplémentaire ni
migration Prisma n’est nécessaire : l’horloge est stockée sur la partie liée.

## Routes

| Méthode | Route | Fonction |
| --- | --- | --- |
| `POST` | `/` | Créer un défi direct |
| `GET` | `/me` | Lister les défis envoyés et reçus |
| `POST` | `/:challengeId/accept` | Accepter un défi reçu |
| `POST` | `/:challengeId/decline` | Refuser un défi reçu |
| `POST` | `/:challengeId/cancel` | Annuler un défi créé |

### Création

Exemple de défi adressé directement à un joueur :

```json
{
  "invitedUserId": 42,
  "initialTimeSeconds": 600,
  "incrementSeconds": 5,
  "colorPreference": "RANDOM",
  "isRated": true
}
```

`colorPreference` accepte `WHITE`, `BLACK` ou `RANDOM` (valeur par défaut).
Les parties classées (`isRated: true`) sont réservées aux défis adressés à un
compte joueur et nécessitent une cadence chronométrée. Leur catégorie Elo est
déduite du contrôle du temps. Les défis ouverts par lien restent amicaux.

Pour créer un défi ouvert à accepter via lien, omettre `invitedUserId` ou lui
donner `null`. Seul le créateur pourra ensuite créer un lien pour ce défi.

Pour une partie sans chronomètre, fournir `initialTimeSeconds: 0` et
`incrementSeconds: 0`. La durée initiale est limitée à deux heures et
l’incrément à 180 secondes.

La création enregistre dans une transaction le défi `PENDING`, sa partie
`CHALLENGE` en attente et la place blanche du créateur. À l’acceptation, le
joueur invité reçoit les noirs ; la partie commence quand les deux joueurs
rejoignent la salle WebSocket.

Le refus et l’annulation utilisent le statut Prisma `CANCELLED` : le modèle
actuel ne distingue pas ces deux issues. Le créateur seul peut annuler son
invitation ; seul l’invité peut accepter ou refuser.

Les défis expirent après 30 minutes. Un worker démarre avec l'API, recherche
chaque minute jusqu'à 100 défis échus et applique leur expiration. Les
notifications persistées pour les comptes concernés et l'annulation de la
partie en attente sont écrites dans la même transaction. Après commit, le
serveur diffuse l'expiration à la salle de partie et aux salles de notification
personnelles. Les lectures et actions qui détectent une échéance utilisent le
même traitement atomique.

Un blocage dans l'un ou l'autre sens interdit les défis ciblés, leur acceptation
et la consommation d'un lien par un compte concerné. Voir
[Social et blocages](./social-et-blocages.md).

## Code et tests

- Routes : [`challenges.ts`](../../server/src/routes/challenges.ts)
- Contrôleur : [`challenge.controller.ts`](../../server/src/controller/challenge.controller.ts)
- Service : [`challengeService.ts`](../../server/src/service/challengeService.ts)
- Repository et transactions : [`challenge.repository.ts`](../../server/src/repository/challenge.repository.ts)
- Tests métier : `challengeService.test.ts`

Pour partager un défi ouvert avec un lien à usage unique, consulter
[Liens d’invitation](./liens-invitation.md). Les liens d’inscription aux
tournois ne sont pas encore implémentés.
