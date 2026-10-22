# Suite des travaux backend

Cette feuille distingue les fonctionnalités déjà présentes des validations
encore à effectuer. Aucun chantier d'implémentation backend en attente n'est
attesté par l'état documenté ci-dessous; les travaux restants identifiés sont
des vérifications propres à chaque environnement. Chaque domaine garde sa
documentation dans un fichier dédié; voir [README.md](./README.md).

## 1. Consolider les tournois

### Déjà implémenté

- CRUD métier, inscriptions de comptes authentifiés et liens d'invitation.
- Appariements Swiss/Round Robin, rondes et classements.
- Départage Swiss : score, Buchholz, puis médiane Buchholz.
- Rating des parties de tournoi appliqué lors de la finalisation du tournoi.
- Tests PostgreSQL d'inscription concurrente sous capacité, et de finalisation
  concurrente/idempotente avec vérification du rating appliqué une seule fois.
- Test d'intégration du parcours tournoi-partie : démarrage par route HTTP,
  connexion des joueurs, mat joué et diffusé sur Socket.IO, puis finalisation
  du tournoi et application du rating.
- Les bye sont inférés depuis la ronde. Aucun retrait/disqualification
  automatique après démarrage n'est exposé; toute sortie doit être une action
  explicite d'un organisateur ou administrateur.
- Les champs de cadence restent sur `Game`; aucun champ ou migration redondant
  n'a été ajouté.

### Reste à faire

- Aucun scénario de tournoi restant n'est identifié dans le code : les tests
  PostgreSQL couvrent l'inscription concurrente sous capacité, la finalisation
  concurrente/idempotente et le parcours HTTP + Socket.IO jusqu'au rating.
- Le seul contrôle restant est celui des bases de déploiement, détaillé dans
  « Vérifications par environnement » ci-dessous.

## 2. Compléter les règles de partie

### Déjà implémenté

- Les fins automatiques après un coup couvrent échec et mat, pat, répétition
  triple, matériel insuffisant et règle des 50 coups.
- Les actions de partie incluent abandon, offre/réponse à une nulle et
  annulation de coup pour les parties locales.
- Les invités peuvent effectuer les actions autorisées avec le `participantId`
  vérifié depuis leur jeton signé.
- Après 60 secondes sans premier coup, les Noirs peuvent réclamer une nulle;
  hors tournoi, ils peuvent aussi annuler sans résultat; en tournoi, ils peuvent
  réclamer la victoire. Les résultats `NO_SHOW` ne sont pas éligibles au rating.
- Les parcours de coup terminal, abandon, nulle acceptée, timeout et absence
  appellent le traitement partagé de fin de partie.
- Le traitement partagé applique le rating des parties classées hors tournoi
  et déclenche les notifications `GAME_FINISHED`. Le rating de tournoi reste
  différé jusqu'à sa finalisation.
- Les statistiques persistées (`UserStatistics` et le registre par partie) sont
  mises à jour dans la transaction de fin; la contrainte unique rend le
  traitement idempotent. `GET /api/users/me/statistics` expose les totaux.
- Les succès liés aux parties sont recalculés dans cette transaction et
  couverts par le scénario PostgreSQL de fin de partie.
- Les invités disposent de notifications persistées reliées à leur participant,
  consultables avec leur jeton de partie et diffusées sur leur salle privée.
- Les scénarios PostgreSQL ajoutés couvrent l'abandon concurrent et idempotent,
  la nulle acceptée, le timeout, ainsi que le rollback conjoint de la partie,
  des ratings, des statistiques et des notifications.
- Ils couvrent aussi l'expiration concurrente/idempotente d'un
  défi, l'annulation de sa partie en attente et ses notifications.
- D'autres scénarios couvrent la réclamation d'absence en tournoi (sans rating)
  et le mat joué comme coup terminal, avec rating et notifications.
- Le 22 octobre 2026, `npx vitest run src/prisma/db.integration.test.ts` a
  réussi depuis `server` avec `TEST_DATABASE_URL` chargé par `.env.test` :
  16 tests sur 16, dont le parcours de tournoi HTTP + Socket.IO. Cette exécution
  confirme la base d'intégration utilisée, pas l'état des bases de déploiement.

### Reste à faire

- Aucun correctif fonctionnel n'est identifié. Les migrations et vérifications
  restantes par environnement sont listées à la fin de ce document.
- Références fonctionnelles : [parties-et-coups.md](./parties-et-coups.md) et
  [temps-reel.md](./temps-reel.md).

## 3. Notifications et événements de défi

### Déjà implémenté

- La création, l'acceptation, le refus et l'annulation d'un défi produisent
  leurs notifications persistées dans la transaction métier; elles sont
  diffusées après commit.
- Un worker traite jusqu'à 100 défis échus chaque minute, annule leur partie
  encore en attente et persiste les notifications dans la même transaction.
- Les expirations déclenchées par les routes utilisent le même traitement et
  sont diffusées à la salle de partie et aux destinataires.
- Les notifications de fin de partie sont persistées et diffusées pour les
  comptes comme pour les participants invités authentifiés par leur jeton.

## 4. Social et règles d'interaction

### Implémenté

- Les demandes d'amitié peuvent être listées, acceptées, refusées et supprimées.
  Une demande inverse en attente devient une amitié acceptée.
- Les utilisateurs peuvent consulter leurs blocages, bloquer et débloquer un
  compte. Bloquer supprime également une éventuelle amitié entre les deux
  comptes.
- Un blocage dans l'un ou l'autre sens interdit les demandes d'amitié, les
  défis ciblés, leur acceptation et l'utilisation d'un lien de défi.
- L'ouverture et la liste des conversations directes sont disponibles; les
  blocages empêchent leur ouverture et masquent les conversations concernées.
  Les échanges privés sont détaillés dans la section 5.
- Détails : [Social et blocages](./social-et-blocages.md).

## 5. Messagerie privée

### Implémenté

- L'API authentifiée prend en charge l'information de conversation, l'envoi,
  l'historique paginé, le marquage de lecture et l'édition/suppression logique.
- L'accès vérifie l'appartenance à une conversation active et respecte les
  blocages des conversations directes.
- Les messages système ne peuvent pas être envoyés comme des messages
  utilisateur; seuls les messages texte de l'auteur peuvent être modifiés ou
  supprimés dans les 24 heures.
- Les rooms Socket.IO vérifient la session et l'appartenance; messages, état de
  lecture, édition/suppression et frappe sont diffusés en temps réel.
- Tests unitaires du service et test d'intégration du gateway pour la messagerie.
- Détails : [social et blocages](./social-et-blocages.md).

## 6. Modération, analyse et succès

### Implémenté

- Le parcours `Report` permet de signaler un utilisateur, une partie ou un
  message, de consulter ses propres signalements et de fournir une revue
  administrative avec résolution ou rejet. Les tests PostgreSQL couvrent la
  création, la consultation et la revue persistées.
- Le worker Stockfish traite les parties terminées et expose la consultation et
  la demande d'analyse aux participants. Le moteur est configuré par
  `STOCKFISH_PATH`; `npm run stockfish:check` valide le binaire et le protocole
  UCI sans base de données. Les résultats sont uniques par partie et moteur.
- Les succès suivent les statistiques de partie, les ratings, les séries de
  victoires, les amitiés et la finalisation des tournois. Le catalogue initial
  est créé par `npm run db:seed`. Un test PostgreSQL vérifie la progression,
  le déverrouillage et l'idempotence de la persistance, ainsi que les
  déclencheurs de fin de partie, d'acceptation d'amitié et de finalisation de
  tournoi.
- Détails et contrats HTTP : [modération, analyse et succès](./moderation-analyse-succes.md).

## 7. Interfaces frontend associées

- La page « Mes succès » appelle `GET /api/users/me/achievements` et présente
  les objectifs, leur progression, leur état de déverrouillage ainsi que les
  erreurs de chargement.
- La navigation distingue les espaces correspondant aux rôles réellement
  définis par l'API : `USER` (joueur), `ORGANIZER` et `ADMIN`. L'espace
  organisateur permet de créer un tournoi et d'accéder à la liste des tournois;
  l'espace administrateur permet de traiter les signalements en attente et de
  créer des comptes administrateur ou organisateur.
- « Agent » n'est pas un rôle déclaré par le backend actuel; les vues sont
  donc liées aux rôles `USER`, `ORGANIZER` et `ADMIN`, sans ajouter de rôle
  implicite.
- Les contrôles d'autorisation restent appliqués côté API; masquer une entrée
  de navigation ne remplace pas les vérifications serveur.

## Vérifications par environnement

État révisé le 22 octobre 2026 d'après les sorties fournies dans cette
conversation. Les statuts de migration et de vérification ci-dessous sont
confirmés pour les connexions sélectionnées par chaque fichier d'environnement;
ils ne permettent pas, à eux seuls, de prouver que des URL différentes
correspondent à des bases physiquement isolées.

| Domaine / environnement | État confirmé | Reste à faire |
| --- | --- | --- |
| Migrations production | `migration:status` affiche `Up to date`; `db:verify` confirme le marqueur et le schéma au contrat `3720491`. | Rien pour le schéma courant, sauf nouvelle migration. |
| Migrations développement | `migration:status` affiche `Up to date`; `db:verify` confirme le marqueur et le schéma au contrat `3720491`. | Rien pour le schéma courant, sauf nouvelle migration. |
| Migrations test | `migration:status` affiche `Up to date`; le seed a pu se connecter à cette cible. | Rien pour le schéma courant, sauf nouvelle migration. |
| Catalogue succès | `npm run db:seed` a réussi deux fois sous `.env.test`; le seed est idempotent et n'insère plus de comptes de démonstration. | Vérifier le résultat visible par un compte avec `GET /api/users/me/achievements`. |
| Premier administrateur | Le bootstrap a créé un compte en test et en développement. En production, il a refusé l'opération parce qu'un admin existe déjà. | Aucun bootstrap à relancer sur ces bases. Créer les autres rôles privilégiés via l'API admin. |
| Stockfish | `npm run stockfish:check` a réussi avec Stockfish 19, profondeur 10 et le coup `e2e4`. La commande ciblée `stockfish:analyze` et ses tests sont présents. | Faire une analyse réelle d'une partie terminée par ID puis vérifier le résultat persisté ou le parcours API jusqu'à `READY`. |
| Tests unitaires / intégration simulée | Build et TypeScript passent; 139 tests non PostgreSQL passent. Les tests unitaires du worker et du service d'analyse passent. | Aucun point identifié dans cette catégorie. |
| Tests PostgreSQL | Des scénarios couvrent les routes de signalement, le endpoint succès, les transactions de progrès, l'amitié, la fin de partie et le tournoi. | Exécuter la suite PostgreSQL et confirmer le résultat; ne pas la considérer validée sans résultat de test. |

### Validations restantes

1. Depuis `server`, exécuter `npx vitest run src/prisma/db.integration.test.ts`
   et confirmer que les 16 tests PostgreSQL passent sur la base de test dédiée.
   La suite utilise exclusivement `TEST_DATABASE_URL` du processus ou du
   fichier `.env.test`; elle ne doit pas cibler la production. Les migrations
   sont à jour selon le statut fourni, mais l'exécution des tests n'est pas
   encore attestée par une sortie de résultat.
2. Après le seed réussi, se connecter avec un compte de test et vérifier
   `GET /api/users/me/achievements`, notamment que le catalogue attendu est
   renvoyé.
3. Lancer une analyse réelle par ID avec
   `npm run stockfish:analyze -- <gameId>` sous le bon `NODE_ENV`, ou demander
   l'analyse via l'API et vérifier `READY` ainsi que la persistance après une
   nouvelle lecture. Ne pas utiliser un ID réel avec une base différente.
4. Les vérifications d'exploitation restent propres à chaque déploiement :
   confirmer que Stockfish est accessible au compte de service sur chaque
   instance qui héberge le worker et que les paramètres réseau/secrets sont
   correctement injectés. La commande manuelle et le contrôle UCI sont décrits
   dans [moderation-analyse-succes.md](./moderation-analyse-succes.md).

Les anciennes migrations divergentes n'ont pas à être rejouées sur les bases
dont `migration:status` affiche `Up to date` et `db:verify` réussit. Pour une
future migration, vérifier son chemin et son plan avant application, comme
indiqué dans [migrations-et-refs.md](./migrations-et-refs.md).
