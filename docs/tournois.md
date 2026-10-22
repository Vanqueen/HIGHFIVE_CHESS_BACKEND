# Tournois

Les tournois utilisent directement `Tournament`, `TournamentParticipant`,
`TournamentRound` et les parties liées par `Game.tournamentRoundId`. L'horloge est enregistrée sur
chaque partie et le nombre de rondes est calculé à partir du format et du nombre
de participants actifs.

## Accès et inscriptions

Les routes sont montées sous `/api/tournaments`.

| Méthode | Route | Fonction |
| --- | --- | --- |
| `GET` | `/` | Lister les tournois (`?limit=`, de 1 à 100) |
| `GET` | `/:tournamentId` | Lire le tournoi, ses participants et ses rondes |
| `GET` | `/:tournamentId/standings` | Lire le classement calculé |
| `GET` | `/:tournamentId/rounds/:roundNumber` | Lire les parties d'une ronde |
| `POST` | `/` | Créer un tournoi (organisateur ou administrateur) |
| `POST` | `/:tournamentId/registration/open` | Ouvrir les inscriptions |
| `POST` | `/:tournamentId/registration/close` | Fermer les inscriptions |
| `POST` | `/:tournamentId/register` | Inscrire le compte connecté |
| `DELETE` | `/:tournamentId/participants/me` | Se retirer avant la clôture |
| `POST` | `/:tournamentId/invitation-links` | Créer un lien d'inscription |
| `GET` | `/:tournamentId/invitation-links` | Lister les liens (propriétaire) |
| `DELETE` | `/:tournamentId/invitation-links/:linkId` | Révoquer un lien |
| `POST` | `/:tournamentId/invitation-links/redeem` | S'inscrire avec `{ "token": "..." }` |
| `POST` | `/:tournamentId/start` | Démarrer avec les champs d'horloge |
| `POST` | `/:tournamentId/rounds/next` | Finaliser une ronde et avancer |
| `POST` | `/:tournamentId/cancel` | Annuler avant le démarrage |

Les routes de consultation sont publiques. Toutes les mutations demandent une
authentification; la création, l'administration et les actions d'organisateur
sont réservées à l'organisateur du tournoi ou à un administrateur. Un
participant doit avoir un compte actif. Les valeurs `GUEST` présentes dans le
schéma ne sont pas admises dans le service de tournoi.

Les liens contiennent un secret aléatoire retourné à leur création. Seul son
hash est conservé en base. Un lien peut être limité en nombre d'utilisations et
expire au plus tard à la clôture des inscriptions.

## Formats, rondes et classement

- **Swiss** : `max(1, ceil(log2(N)))` rondes, où `N` est le nombre de joueurs
  actifs au démarrage. Les appariements évitent les rematches lorsque c'est
  possible et attribuent un bye à un joueur qui n'en a pas encore eu.
- **Round Robin** : `N - 1` rondes si `N` est pair, sinon `N` rondes. Chaque
  paire se rencontre une fois; pour un nombre impair, chaque joueur reçoit un
  bye.
- Les participants ayant un bye reçoivent un point. Le classement trie par
  score, Buchholz, médiane Buchholz, puis victoires, seed et date
  d'inscription.
- Chaque partie de la première ronde reçoit la cadence fournie à la création
  du tournoi. Les rondes suivantes reprennent celle des parties de la ronde
  précédente. Les résultats sont les résultats persistés sur `Game`.
- Une ronde ne peut être avancée que lorsque toutes ses parties sont terminées.
  L'avancement est déclenché par l'organisateur; il n'est pas automatique.

Le modèle ne stocke pas explicitement le participant ayant reçu un bye. Le
classement l'infère comme l'unique participant actif non apparié dans une ronde terminée. Aucune suppression automatique après le début n'est exposée : tout
retrait ou disqualification doit être une action explicite d'un organisateur ou
administrateur, sans recalcul implicite des appariements ou du classement en
cours.

## Tournois classés

Un tournoi `isRated` exige `ratingCategory`. À sa finalisation, toutes les
parties classées terminées sont appliquées aux `Rating` et `RatingHistory` dans la même transaction que la finalisation du tournoi. Le calcul utilise Elo avec un K constant de 32, un rating initial de 1500 et le statut provisoire jusqu'à 20 parties. L'écriture est protégée contre le retraitement d'une même partie; les comptes concernés sont verrouillés dans un ordre stable pour sérialiser les mises à jour concurrentes.

Les parties classées hors tournoi utilisent également le traitement partagé de
fin de partie : leur rating et leur historique sont mis à jour à la fin de la
partie. Pour un tournoi classé, l'application du rating reste différée à la
finalisation du tournoi afin d'éviter un double comptage.

## Fichiers principaux

- Routes : [`tournaments.ts`](../../server/src/routes/tournaments.ts)
- Contrôleur : [`tournament.controller.ts`](../../server/src/controller/tournament.controller.ts)
- Règles et classements : [`tournamentService.ts`](../../server/src/service/tournamentService.ts)
- Appariements : [`tournamentPairing.ts`](../../server/src/service/tournamentPairing.ts)
- Calcul Elo : [`tournamentRating.ts`](../../server/src/service/tournamentRating.ts)
- Transactions et persistance : [`tournament.repository.ts`](../../server/src/repository/tournament.repository.ts)
- Tests unitaires des appariements : [`tournamentPairing.test.ts`](../../server/src/service/tournamentPairing.test.ts)
- Tests unitaires du calcul Elo : [`tournamentRating.test.ts`](../../server/src/service/tournamentRating.test.ts)

## Vérifications

Les tests unitaires couvrent les algorithmes d'appariement et le calcul Elo.
Les tests PostgreSQL couvrent également les courses d'inscription, la
finalisation concurrente/idempotente avec application unique du rating, et le
parcours complet HTTP + Socket.IO d'une partie de tournoi jusqu'à sa
finalisation. L'exécution du 22 octobre 2026 a réussi (16/16 tests) sur la base
d'intégration configurée par `TEST_DATABASE_URL`. Les contrôles de migration
sur les bases de déploiement restent distincts; voir
[suite-des-travaux.md](./suite-des-travaux.md).
