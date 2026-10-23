# Liens d'invitation et joueurs sans compte

Les liens de défi à usage unique et les parties entre joueurs anonymes sont
pris en charge sans créer de profil utilisateur ni modifier le modèle Prisma.
Les tournois restent réservés aux comptes : aucun invité anonyme ne peut être
inscrit comme `TournamentParticipant`, même via un lien d'invitation.

## Parcours d'un défi ouvert

1. Créer un défi sans `invitedUserId` en fournissant le contrôle du temps.
2. Le créateur génère un lien avec `POST /api/challenges/:challengeId/invitation-links`.
3. Transmettre le jeton retourné au destinataire ; il n'est affiché qu'à la
   création et ne peut pas être relu ensuite.
4. Le destinataire, connecté ou anonyme, appelle
   `POST /api/invitation-links/redeem` avec `{ "token": "..." }`.
5. Un compte authentifié est associé comme participant `USER`. Sans jeton
   Bearer, le joueur est associé comme participant `GUEST`; la réponse inclut
   alors `guestSessionToken`. Les deux participants peuvent rejoindre la partie
   par WebSocket.

Un défi adressé à un joueur précis peut aussi être partagé par lien, mais seul
le compte désigné pourra le consommer. Un invité anonyme ne peut accepter qu'un
défi ouvert, créé par un utilisateur authentifié.

Si le créateur et le compte qui consomme le lien se bloquent dans l'un ou l'autre
sens, la consommation est refusée. Les acceptations anonymes ne sont pas
concernées, car elles n'ont pas d'identité de compte à vérifier. Pour les règles
complètes, voir [Social et blocages](./social-et-blocages.md).

## Partie créée par un invité contre un compte ou un autre invité

1. Appeler `POST /api/invitation-links/anonymous` avec
   `{ "initialTimeSeconds": 300, "incrementSeconds": 0 }`.
   Aucun jeton préexistant ni compte n'est requis pour la création.
2. Le créateur reçoit un `guestSessionToken` pour sa place et un `inviteToken`
   à transmettre à l'autre joueur, ainsi que sa place (`participant`) pour
   rejoindre immédiatement la partie.
3. Le second joueur appelle `POST /api/invitation-links/anonymous/redeem`
   avec `{ "token": "..." }`. Sans compte, la réponse fournit son propre
   `guestSessionToken`; si le joueur est connecté, sa place est associée à son
   compte et il continue avec son jeton d'accès normal. Le créateur invité peut
   donc envoyer le lien directement à un ami authentifié.
4. Les joueurs ouvrent une connexion Socket.IO avec
   leur jeton respectif, puis rejoignent la partie. Le serveur accepte ainsi
   les combinaisons compte/compte, compte/invité, invité/invité et
   invité/compte.

Le jeton d'invitation stateless expire après 30 minutes et chaque partie ne
dispose que d'une place invitée disponible. Le ticket de session invité expire
après 12 heures et ne permet que l'accès à la partie qui y est inscrite.

## Données et limites des invités

La partie, les places `GameParticipant` de type `GUEST` et les coups sont
persistés. Aucun `User` n'est créé : un invité n'a donc ni profil, ni historique
de compte ni rating. Une partie anonyme est non classée et n'est pas rattachée
à un `Challenge`. Un participant authentifié conserve l'accès normal à sa
partie et à ses coups même si l'adversaire est invité.

Un invité peut rejoindre la partie, recevoir son état, jouer ses coups et
participer au chat de partie par WebSocket ou REST. Comme le modèle `Message`
exige un `senderId` relié à `User`, les messages envoyés par un invité ne sont
pas persistés en base : ils sont gardés temporairement en mémoire du processus
(maximum 50 par partie et 12 heures) et leur identité vient de sa place
`GameParticipant`. Les messages de compte gardent leur persistance normale.
Les messages invités peuvent donc disparaître au redémarrage et ne sont pas
partagés entre plusieurs instances backend sans mécanisme de diffusion partagé.

Les offres de nulle, les annulations et l'abandon restent actuellement
réservés aux participants authentifiés. Ils pourront être ouverts aux invités
en utilisant leur `participantId` plutôt qu'un `userId`, sans créer de compte.

## Endpoints

| Méthode | Route | Accès | Fonction |
| --- | --- | --- | --- |
| `POST` | `/api/challenges/:challengeId/invitation-links` | Créateur authentifié | Générer un lien |
| `GET` | `/api/challenges/:challengeId/invitation-links` | Créateur authentifié | Lister les métadonnées des liens |
| `DELETE` | `/api/challenges/:challengeId/invitation-links/:linkId` | Créateur authentifié | Révoquer un lien actif |
| `POST` | `/api/invitation-links/redeem` | Public; Bearer facultatif | Accepter un défi ouvert comme compte ou invité |
| `POST` | `/api/invitation-links/anonymous` | Public, sans authentification | Créer une partie anonyme et son lien d'invitation; un éventuel jeton Bearer n'est pas vérifié |
| `POST` | `/api/invitation-links/anonymous/redeem` | Public | Rejoindre une partie anonyme |
| `GET` | `/api/games/guest/:gameId/moves` | Ticket invité Bearer | Consulter les coups de sa partie |
| `POST` | `/api/games/guest/:gameId/moves` | Ticket invité Bearer | Jouer un coup et diffuser la mise à jour |
| `GET` | `/api/games/guest/:gameId/messages` | Ticket invité Bearer | Consulter le chat de sa partie |
| `POST` | `/api/games/guest/:gameId/messages` | Ticket invité Bearer | Envoyer un message temporaire |

Pour créer une partie publique, le client omet explicitement le jeton d'accès
local et désactive le renouvellement automatique de session sur cette requête.
Un jeton expiré ne doit pas bloquer la création d'une partie anonyme.

La création accepte un champ optionnel `expiresInMinutes`, entre 1 et 30. Le
lien ne peut jamais expirer après son défi. Chaque lien de défi a
`maxUses: 1`; à l'usage, son compteur passe à 1 et son statut à `EXHAUSTED`.
La consommation conditionnelle et l'acceptation du défi sont faites dans une
transaction. Les autres liens actifs du défi sont désactivés dès qu'il est
accepté, annulé ou expiré.

Le jeton aléatoire de 256 bits est retourné en base64url une seule fois. Seul
son hash SHA-256 est conservé en base ; les listes et les réponses de gestion
ne révèlent jamais le hash. Les jetons malformés et inconnus ont la même
réponse afin de ne pas révéler leur existence.

Les liens expirés sont marqués `EXPIRED` à la consultation de la liste ou lors
d'une tentative d'utilisation. L'expiration du défi désactive aussi ses liens
encore actifs. Il n'y a pas encore de tâche planifiée de nettoyage.

## Code et tests

- Routes : [`challenges.ts`](../../server/src/routes/challenges.ts),
  [`invitation-links.ts`](../../server/src/routes/invitation-links.ts)
- Contrôleur : [`invitation-link.controller.ts`](../../server/src/controller/invitation-link.controller.ts)
- Service : [`invitationLinkService.ts`](../../server/src/service/invitationLinkService.ts)
- Transactions : [`invitation-link.repository.ts`](../../server/src/repository/invitation-link.repository.ts)
- Parties anonymes : [`anonymousGameService.ts`](../../server/src/service/anonymousGameService.ts)
- Tests : `invitationLinkService.test.ts`
