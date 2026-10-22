# Parties et coups

Les routes sont montées sous `/api/games`. Les routes standard demandent un
utilisateur authentifié; les routes `/guest/...` demandent un jeton de session
invité signé et limité à sa partie. La création générique reste réservée aux
corps validés par le contrôleur; les défis créent leur propre partie dans le
parcours décrit dans [defis.md](./defis.md).

## Routes REST

| Méthode | Route | Fonction |
| --- | --- | --- |
| `POST` | `/` | Créer une partie et ses participants |
| `GET` | `/me` | Lister les parties de l’utilisateur |
| `GET` | `/:gameId` | Consulter une partie |
| `POST` | `/:gameId/moves` | Jouer un coup |
| `GET` | `/:gameId/moves` | Consulter l’historique des coups |
| `POST` | `/:gameId/draw-offers` | Proposer une nulle |
| `POST` | `/:gameId/draw-offers/respond` | Accepter ou refuser une nulle |
| `POST` | `/:gameId/undo-requests` | Demander l’annulation d’un coup |
| `POST` | `/:gameId/undo-requests/respond` | Accepter ou refuser l’annulation |
| `POST` | `/:gameId/resign` | Abandonner |
| `POST` | `/:gameId/no-show` | Résoudre l'absence du premier joueur |
| `GET` | `/:gameId/clock` | Lire les horloges |
| `GET` | `/:gameId/messages` | Lire le chat de partie |
| `POST` | `/:gameId/messages` | Envoyer un message dans le chat |

Les deux routes `respond` reçoivent `{ "accept": boolean }`. Un coup doit être
légal selon `chess.js`, provenir d’un participant et respecter le tour ainsi que
l’état courant de la partie. Les mises à jour de partie et l’écriture du coup
sont transactionnelles. Les valeurs `BigInt` des horloges sont sérialisées en
chaînes pour JSON.

Les invités peuvent aussi jouer et effectuer les actions de partie avec leur
jeton de session invité dans `Authorization: Bearer <guestSessionToken>` :

| Méthode | Route | Fonction |
| --- | --- | --- |
| `POST` | `/guest/:gameId/moves` | Jouer un coup |
| `POST` | `/guest/:gameId/draw-offers` | Proposer une nulle |
| `POST` | `/guest/:gameId/draw-offers/respond` | Accepter ou refuser une nulle |
| `POST` | `/guest/:gameId/undo-requests` | Demander une annulation (partie locale) |
| `POST` | `/guest/:gameId/undo-requests/respond` | Accepter ou refuser l'annulation |
| `POST` | `/guest/:gameId/resign` | Abandonner |
| `POST` | `/guest/:gameId/no-show` | Résoudre l'absence du premier joueur |
| `GET` | `/guest/:gameId/notifications` | Lire les notifications du participant invité |

Le `participantId` provient du jeton signé et est vérifié contre la partie et
le participant invité correspondant. Il n'est jamais accepté seul depuis le
corps de la requête. Les actions WebSocket utilisent de même le participant
attaché à la session invité; aucune présence `User` ni compte n'est créé.
Les notifications invitées sont persistées par `participantId`, consultables
avec le même jeton de session et diffusées uniquement à sa salle Socket.IO
privée.

L’annulation nécessite une position précédente connue. `fenBefore` est nullable
pour les anciens coups ; le backfill documenté dans
[maintenance-donnees.md](./maintenance-donnees.md) ne reconstitue que les
positions vérifiables.

Les fins de partie automatiques détectées après un coup couvrent l'échec et mat,
le pat, la répétition triple, le matériel insuffisant et la règle des 50 coups.

## Absence avant le premier coup

Le délai d'absence part de `startedAt`, créé quand la partie passe à
`IN_PROGRESS` après que les deux participants sont prêts. Si les Blancs n'ont
pas joué après 60 secondes, les Noirs peuvent réclamer une résolution via
`POST /:gameId/no-show` (ou la route invité correspondante), avec
`{ "outcome": "DRAW" | "CANCEL" | "WIN" }`. Le serveur exige que l'appelant
soit le participant noir, vérifie l'échéance et l'absence de coups, puis
effectue la transition dans une transaction conditionnelle afin qu'un coup
concurrent et la réclamation ne puissent pas tous deux réussir.

- Partie hors tournoi : `DRAW` termine la partie avec une nulle; `CANCEL`
  l'annule sans résultat. L'abandon du salon Socket.IO, lui, ne termine pas la
  partie et ne crée aucun résultat.
- Partie de tournoi : `DRAW` enregistre une nulle; `WIN` donne la victoire aux
  Noirs par `NO_SHOW`. L'annulation n'est pas permise afin de ne pas bloquer la
  ronde.
- Un résultat de tournoi terminé sans aucun coup joué ne modifie pas le rating
  Elo, y compris si l'horloge a expiré avant la réclamation. `NO_SHOW` est un
  motif de fin distinct; la migration est dans
  [`20261012T1805_no_show_termination`](../../server/migrations/app/20261012T1805_no_show_termination).
  Appliquer les migrations en attente avec `npm run migrate` sur chaque base
  cible avant déploiement.

Le client peut afficher un compte à rebours à partir de `startedAt`, mais la
décision est toujours validée côté serveur; la réclamation n'est disponible
qu'après le délai révolu.

## Statistiques persistées

Une partie terminée avec un résultat enregistre une ligne unique par compte
participant dans `GamePlayerStatistic` et met à jour l'agrégat `UserStatistics`
dans la même transaction que les ratings et les notifications. Les annulations
sans résultat et les participants invités ne modifient pas l'agrégat d'un
compte. La contrainte unique par partie et compte rend l'effet idempotent.
L'utilisateur authentifié consulte ses totaux avec
`GET /api/users/me/statistics`.

## Code

- Routes : [`game.ts`](../../server/src/routes/game.ts)
- Logique : [`gameService.ts`](../../server/src/service/gameService.ts),
  [`moveService.ts`](../../server/src/service/moveService.ts),
  [`gameChatService.ts`](../../server/src/service/gameChatService.ts)
- Persistance : `game.repository.ts`, `game-action.repository.ts`,
  `game-participant.repository.ts`, `move.repository.ts`,
  `game-chat.repository.ts`
- REST et WebSocket : les actions REST publient leurs changements aux clients
  connectés ; voir [temps-reel.md](./temps-reel.md).
