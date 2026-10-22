# Migrations Prisma et refs de contrats

## Rôle du ref `db`

`server/migrations/app/refs/db.json` est un pointeur local vers un contrat,
utilisé comme origine par le planificateur hors ligne. Ce n’est pas le journal
de la base et il n’est pas avancé automatiquement par `prisma db migrate`.
Le marqueur stocké en base et le ref `db` sont donc deux états distincts.

Après l’application réussie de `NO_SHOW`, la commande a annoncé le marqueur
`b7818c5d354030fc918c504f733cce7cbc969eaf233af50a374c0f84dec04d12`. Le ref
local pointait encore sur `34a1bf1225376bd559928aa05f3a70a70142915251543c53f96b3aacbd85984a`,
ce qui faisait apparaître quatre migrations en attente dans le calcul hors
ligne, même si la base avait déjà avancé. Le ref `db` a été réaligné sur le
marqueur annoncé par `db migrate`.

`npm run migration:status -- --from db` vérifie hors ligne le chemin entre le
ref local et le contrat courant ; il ne consulte pas la base. La sortie
« Up to date » après réalignement confirme seulement que ces deux contrats
locaux sont identiques. `npm run migration:status` sans `--from` consulte le
marqueur de la base configurée et reste la vérification à utiliser pour son
état réel.

## Chaîne atteignant `NO_SHOW`

La chaîne depuis le contrat `34a1bf12…` est continue :

```text
34a1bf12… -- 20261009T1727_migration -----------------> e866da00…
e866da00… -- 20261009T1730_persist_avatar_public_id --> 8fc7e331…
8fc7e331… -- 20261009T1838_game_actions_chat_and_move_rollback --> ab5348b8…
ab5348b8… -- 20261012T1805_no_show_termination -------> b7818c5d…
```

La migration `20261012T1805_no_show_termination` a deux opérations : supprimer
l’ancienne contrainte `CHECK` de `Game.terminationReason`, puis créer la
contrainte qui inclut `NO_SHOW`. La sortie de `prisma db migrate` confirme
qu’elle a été appliquée et que le marqueur a atteint `b7818c5d…`.

Le graphe contient également `20261001T1907_init` (`null → 91e7f9f0…`), une
racine distincte qui n’est pas sur le chemin du ref `db` actuel. Ne pas la
supprimer ni la rattacher à la chaîne sans avoir établi si une base ou un
déploiement historique en dépend.

## Vérification avant une prochaine application

1. Confirmer la destination de `DATABASE_URL` sans afficher sa valeur.
2. Exécuter `npm run migration:status` pour lire l’origine réelle du marqueur
   de cette base et le chemin jusqu’au contrat cible.
3. Examiner chaque migration en attente et les opérations destructives.
4. N’appliquer `npm run migrate` qu’à l’environnement voulu.

Le ref local peut être consulté avec `prisma migration ref list`. Il ne remplace
jamais la lecture du marqueur de chaque environnement (`development`,
`staging`, `production`).

Pour planifier une nouvelle migration, utiliser le contrat terminal de la
dernière migration du graphe avec
`npm run migration:plan -- --from <derniere-migration> --name <slug>`. Le ref `db` peut volontairement rester sur
le contrat réellement appliqué à une base tant que les migrations en attente
n'ont pas été exécutées; ne pas l'utiliser comme point de départ pour générer
une deuxième migration contenant des opérations déjà présentes dans le graphe.

La contrainte unique ajoutée pour les analyses doit être vérifiée sur chaque
base avant application: rechercher d'éventuelles lignes `GameAnalysis` en
doublon sur `(gameId, engine)`. La migration ne supprime pas les analyses
existantes et échouera explicitement si de tels doublons empêchent la
contrainte.

La migration `20261021T1311_stockfish_analysis_uniqueness` et les autres
migrations en attente doivent être contrôlées puis appliquées séparément à
chaque environnement par l'opérateur. Les tests PostgreSQL ne migrent pas leur
base automatiquement; configurer `TEST_DATABASE_URL` sur une base de test déjà
migrée avant leur exécution.

## Échec d'ajout de la FK des notifications invitées

L'erreur `GuestNotification_guestParticipantId_fkey` indique qu'au moins une
ligne de `GuestNotification` référence un `guestParticipantId` absent de
`GameParticipant`. La FK ne doit pas être contournée : elle protège l'intégrité
des notifications invitées.

Avant toute nouvelle tentative, vérifier la cible. La valeur `NODE_ENV`, et non
le nom de branche Git, choisit `.env.<NODE_ENV>` pour les commandes Prisma. Si
les logs indiquent `.env.development`, la commande n'a pas sélectionné
`.env.production`. Confirmer l'hôte et le nom de base sans divulguer la chaîne
de connexion; contrôler ensuite `npm run migration:status` et
`npm run db:verify`. Une commande de mise à jour qui a échoué peut avoir laissé
des changements partiels; ne pas supposer que les cinq opérations destructives
confirmées ont toutes été annulées.

Sur la base confirmée, cette requête est en lecture seule et identifie les
notifications orphelines :

```sql
SELECT notification."id",
       notification."guestParticipantId",
       notification."type",
       notification."createdAt"
FROM public."GuestNotification" AS notification
LEFT JOIN public."GameParticipant" AS participant
  ON participant."id" = notification."guestParticipantId"
WHERE participant."id" IS NULL
ORDER BY notification."createdAt";
```

Sauvegarder les lignes affectées et rechercher la cause avant correction. Si
elles sont des notifications devenues inutilisables et que leur suppression
est approuvée, archiver/exporter d'abord ces lignes, supprimer uniquement les
IDs confirmés, puis vérifier à nouveau la migration et le schéma. Ne pas
inclure de suppression automatique dans la migration : cela détruirait des
données sans examen. Examiner également les cinq suppressions de contraintes
et d'index affichées par le planificateur contre le schéma réel avant toute
nouvelle confirmation.

## Règle d'exploitation

Les migrations Prisma sont l'unique mécanisme de création et d'évolution du
schéma. Le serveur se connecte à PostgreSQL sans exécuter de DDL au démarrage.
Avant de lancer une nouvelle version, appliquer les migrations attendues à la
base cible et vérifier leur état avec `npm run migration:status`. Une base de
test doit également recevoir les migrations avant les tests d'intégration;
les tests et le serveur ne créent pas implicitement les tables manquantes.
