# WebSocket et présence

Socket.IO partage le serveur HTTP de l’API. La configuration est centralisée
dans [`websocket.config.ts`](../../server/src/config/websocket.config.ts) et les
noms d’événements dans `server/src/events/`.

## Connexion et partie

Le client s’authentifie avec `auth.accessToken` (ou un en-tête Bearer valide),
puis rejoint une salle avec `join-game`. Seuls les participants de la partie
peuvent la rejoindre pour recevoir l’état ou envoyer des actions.

| Direction | Événement | Données principales |
| --- | --- | --- |
| Client → serveur | `join-game` | `{ gameId }` |
| Client → serveur | `leave-game` | `{ gameId }` |
| Serveur → client | `game-state` | Partie, participants, coups et messages |
| Serveur → salle | `game-ready` | `{ gameId }` quand les deux participants sont connectés |
| Client → serveur | `move` | `{ gameId, from, to, promotion? }` |
| Serveur → salle | `move-played` | Partie et coup persistés |
| Client → serveur | `offer-draw`, `respond-draw` | `gameId`, réponse booléenne |
| Client → serveur | `request-undo`, `respond-undo` | `gameId`, réponse booléenne |
| Client → serveur | `resign` | `{ gameId }` |
| Client → serveur | `send-message` | `{ gameId, content }` |
| Serveur → salle | `game-updated` | Action métier et résultat |
| Serveur → salle | `chat-message` | Message persistant (compte) ou temporaire (invité) |
| Serveur → salle | `timer-update` | Horloges restantes, couleur active |
| Serveur → salle | `player-joined`, `player-left` | `{ participantId, userId? }` |

Les événements avec callback d’acquittement répondent avec
`{ success, data?, error? }`. Les durées `BigInt` sont envoyées en chaînes.
Les joueurs peuvent jouer le premier coup lorsque les deux participants ont
rejoint la salle. Le compte à rebours démarre à l'enregistrement du premier
coup des Blancs. Les coups sont transmis par Socket.IO; la session utilisateur
ou le ticket invité est revalidé périodiquement.

## Recherche d'un adversaire aléatoire

`POST /api/games/matchmaking` crée une partie d'attente pour le compte connecté
ou, sans authentification, pour un joueur invité. La requête contient
`initialTimeSeconds` et `incrementSeconds`. Un invité reçoit un
`guestSessionToken` nécessaire à la connexion Socket.IO.

Le client transmet ensuite `matchmaking-join` avec `{ gameId }`. Le serveur
apparie aléatoirement deux recherches connectées ayant la même cadence, attribue
les couleurs au moment de l'appariement, puis envoie `matchmaking-found` à
chacun avec sa couleur et son identifiant de participant. Les invités reçoivent
un jeton de session pour la partie appariée. `matchmaking-cancel` annule une
recherche en attente; une déconnexion retire aussi le joueur de la file.

Les parties rapides entre deux comptes sont classées. Leur catégorie est
déduite du contrôle de temps en estimant 40 coups : jusqu'à 180 secondes,
`BLITZ`; jusqu'à 900 secondes, `RAPID`; au-delà, `CLASSICAL`. Les parties
impliquant un invité restent non classées. Chaque catégorie commence à 1500 Elo
et évolue après la fin d'une partie classée.

`GET /api/users/me/ratings` renvoie l'Elo global (moyenne des catégories) et
les scores `BLITZ`, `RAPID` et `CLASSICAL`. Une catégorie sans historique est
retournée à 1500 Elo, provisoire.

La file de matchmaking est actuellement conservée en mémoire par le processus
backend. Un déploiement multi-instance doit partager cette file entre les
instances pour que les joueurs puissent être appariés entre elles.

## Chat des parties avec invités

Un compte continue d'envoyer des messages persistés via le modèle `Message`.
Un joueur `GUEST` peut lui aussi envoyer des messages, attribués à son
`participantId` puis diffusés dans la salle. Comme `Message.senderId` impose un
compte, ces messages invités ne sont pas enregistrés en base. Ils sont gardés
en mémoire dans le processus (maximum 50 par partie et 12 heures), fusionnés
avec les messages persistés au chargement et diffusés aux joueurs connectés.
Un redémarrage peut les faire perdre; plusieurs instances backend nécessitent
un mécanisme partagé pour conserver cette cohérence. Aucun `userId` sentinelle
n'est utilisé.

Les invités se connectent avec `auth.guestSessionToken` au lieu de
`auth.accessToken`. Le chat est également disponible via
`GET`/`POST /api/games/guest/:gameId/messages`, en transmettant le ticket invité
comme jeton Bearer.

## Présence et diffusion REST

`User.connectionStatus` passe à `ONLINE` après connexion authentifiée et à
`OFFLINE` après le départ du dernier socket du même utilisateur. Le registre
est en mémoire : plusieurs instances backend nécessiteront un adaptateur et un
registre partagé.

Les actions REST publient leurs événements via `game.broadcast.ts` ; le gateway
les relaie dans la salle concernée. Ainsi, un client WebSocket connecté reçoit
aussi les coups, actions de partie et messages produits par REST.

Les notifications de compte sont émises dans `user:<userId>`. Les notifications
persistées des invités sont émises dans `guest:<participantId>` et ne sont pas
diffusées à l'autre joueur. Un invité peut relire ses notifications avec
`GET /api/games/guest/:gameId/notifications`, en présentant le jeton de session
invité correspondant à cette partie. L'expiration d'un défi diffuse également
`game-updated` avec l'action `challenge-expired`; ses notifications de
destinataire ne sont publiées qu'après le commit de la transition.

## Code et tests

- Gateway : [`game.gateway.ts`](../../server/src/websocket/game.gateway.ts)
- Présence : `socket-presence.registry.ts`,
  [`userPresenceService.ts`](../../server/src/service/userPresenceService.ts)
- Diffusion partagée : [`game.broadcast.ts`](../../server/src/events/game.broadcast.ts)
- Test d’intégration Socket.IO : `game.gateway.integration.test.ts`
