# Documentation du backend

Cette documentation est séparée par fonctionnalité. Le modèle de données de
référence est [`contract.prisma`](../../server/src/prisma/contract.prisma) ;
les routes et règles métier décrites ici correspondent à leur implémentation
actuelle.

## Fonctionnalités disponibles

| Domaine | Documentation |
| --- | --- |
| Authentification et mots de passe | [authentification.md](./authentification.md) |
| Profil et administration des comptes | [comptes.md](./comptes.md) |
| Parties et coups | [parties-et-coups.md](./parties-et-coups.md) |
| WebSocket et présence | [temps-reel.md](./temps-reel.md) |
| Défis directs | [defis.md](./defis.md) |
| Liens d’invitation de défi | [liens-invitation.md](./liens-invitation.md) |
| Amitiés, blocages et conversations directes | [social-et-blocages.md](./social-et-blocages.md) |
| Signalements, analyses Stockfish et succès | [moderation-analyse-succes.md](./moderation-analyse-succes.md) |
| Tournois | [tournois.md](./tournois.md) |
| Maintenance des données de coups | [maintenance-donnees.md](./maintenance-donnees.md) |

## Suite des travaux

L’ordre proposé, les critères de validation et le statut des fonctionnalités
non encore implémentées sont détaillés dans
[suite-des-travaux.md](./suite-des-travaux.md).
