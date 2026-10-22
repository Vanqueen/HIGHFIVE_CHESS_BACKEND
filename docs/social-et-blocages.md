# Social et blocages

Toutes les routes ci-dessous exigent une authentification et sont montées sous
`/api`.

## Amitiés

| Méthode | Route | Fonction |
| --- | --- | --- |
| `GET` | `/friendships/me` | Lister les demandes et amitiés de l'utilisateur |
| `POST` | `/friendships/:userId` | Envoyer une demande d'amitié |
| `POST` | `/friendships/:friendshipId/accept` | Accepter une demande reçue |
| `POST` | `/friendships/:friendshipId/reject` | Refuser une demande reçue |
| `DELETE` | `/friendships/:friendshipId` | Supprimer une amitié acceptée |

Une demande envoyée à un utilisateur qui a déjà envoyé une demande en attente
accepte cette demande. Une demande en double ou une relation déjà acceptée
retourne `409 Conflict`. Les notifications de demande et d'acceptation sont
persistées avec le changement d'état, puis diffusées après commit.

## Blocages

| Méthode | Route | Fonction |
| --- | --- | --- |
| `GET` | `/blocked-users/me` | Lister les utilisateurs bloqués par le compte courant |
| `POST` | `/blocked-users/:userId` | Bloquer un utilisateur |
| `DELETE` | `/blocked-users/:userId` | Débloquer un utilisateur |

Le blocage est directionnel dans la liste, mais interdit les interactions dans
les deux sens. Il supprime aussi une relation d'amitié existante ou en attente.
Les comptes ne peuvent pas se bloquer eux-mêmes.

## Défis et liens

Un blocage interdit la création d'un défi ciblé, l'acceptation d'un défi reçu et
la consommation d'un lien de défi par un compte bloqué par le créateur ou qui
a bloqué le créateur. Il interdit aussi l'utilisation d'un lien d'inscription
à un tournoi lorsque son créateur et le compte participant se bloquent l'un
l'autre. Les défis ouverts destinés aux invités anonymes ne permettent pas de
vérifier l'identité d'un compte et ne sont donc pas soumis à cette règle lors
d'une acceptation anonyme.

## Conversations directes

| Méthode | Route | Corps |
| --- | --- | --- |
| `GET` | `/conversations/me` | — |
| `POST` | `/conversations/direct` | `{ "userId": 42 }` |
| `GET` | `/conversations/:conversationId` | — |
| `GET` | `/conversations/:conversationId/messages?limit=50&beforeId=123` | — |
| `POST` | `/conversations/:conversationId/messages` | `{ "content": "Bonjour" }` |
| `POST` | `/conversations/:conversationId/read` | — |
| `PUT` | `/conversations/messages/:messageId` | `{ "content": "Texte modifié" }` |
| `DELETE` | `/conversations/messages/:messageId` | — |

La création est idempotente lorsqu'une conversation directe existe déjà entre
les deux participants. Les conversations impliquant un compte bloqué dans l'un
ou l'autre sens ne sont pas retournées; une ouverture est refusée avec
`403 Forbidden`. Toutes les routes de message contrôlent également que le compte
est un participant encore actif et refusent les interactions directes après un
blocage.

La lecture est paginée (50 messages par défaut, maximum 100) par curseur
d'identifiant décroissant; les messages sont renvoyés dans l'ordre
chronologique. Le chargement d'une page et la route `read` mettent à jour
`lastReadAt` et diffusent l'événement de lecture. Les messages texte peuvent
être modifiés pendant 24 heures puis supprimés logiquement par leur auteur.
Un message supprimé n'est plus retourné dans l'historique.

Les événements Socket.IO privés (`conversation:join`, `conversation:leave`,
`message:send`, `conversation:typing:start` et
`conversation:typing:stop`) exigent une session authentifiée. L'entrée dans une
salle vérifie l'appartenance et les blocages; les messages, modifications,
suppression, lectures et états de frappe sont diffusés dans la salle de la
conversation.
