# Profils et administration des comptes

Les routes utilisateurs sont montées sous `/api/users` et toutes requièrent
une authentification.

| Méthode | Route | Accès | Fonction |
| --- | --- | --- | --- |
| `GET` | `/` | Administrateur | Lister les utilisateurs |
| `GET` | `/:userId` | Authentifié | Consulter un profil |
| `PATCH` | `/:userId/role` | Administrateur | Modifier un rôle |
| `PATCH` | `/me/email` | Authentifié | Demander un changement d’adresse |
| `POST` | `/me/email/confirm` | Authentifié | Confirmer le changement par code |
| `PATCH` | `/me/username` | Authentifié | Modifier le pseudo |
| `PATCH` | `/:userId/status` | Administrateur | Modifier le statut du compte |
| `PATCH` | `/me/avatar` | Authentifié | Modifier l’avatar |
| `DELETE` | `/me` | Authentifié | Demander la suppression logique |
| `POST` | `/:userId/restore` | Administrateur | Restaurer un compte supprimé |
| `DELETE` | `/:userId/permanent` | Administrateur | Supprimer définitivement un compte |

Les règles détaillées de validation et les champs acceptés sont dans
[`user.controller.ts`](../../server/src/controller/user.controller.ts) et
[`userService.ts`](../../server/src/service/userService.ts). L’accès aux
données et les opérations multi-modèles sont dans `user.repository.ts` et
`account.repository.ts`.

La présence `ONLINE`/`OFFLINE` est déterminée par les connexions WebSocket
authentifiées ; consulter [temps-reel.md](./temps-reel.md).
