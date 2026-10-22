# Maintenance des données de coups

Les anciennes lignes `Move` peuvent ne pas avoir de `fenBefore`. Le script de
maintenance tente de reconstruire cette valeur sans modifier les positions
qu’il ne peut pas vérifier.

## Exécution

Depuis le dossier `server/` :

```powershell
npm run db:backfill-move-fen -- --apply
```

Sans `--apply`, le script n’ouvre pas de connexion et ne modifie aucune donnée.
Avec confirmation, il affiche le nombre de coups examinés, complétés et non
résolus. Il ne met à jour que les enregistrements dont `fenBefore` est toujours
nul au moment de l’écriture. Les coups non résolus restent nuls et nécessitent
une investigation ; le processus retourne le code `2`.

Pour les coups ultérieurs, le FEN précédent est tiré du `fenAfter` du coup
précédent. Pour le premier coup, le script ne retient le FEN standard que si
rejouer le coup donne exactement le FEN final enregistré. Une position de
départ personnalisée non vérifiable reste donc inchangée.

## Tests de base de données

Les tests PostgreSQL d’intégration lisent et créent des fixtures temporaires.
Ils privilégient `TEST_DATABASE_URL`; sinon, ils utilisent `DATABASE_URL` du
fichier `.env.<NODE_ENV>`. Comme Vitest définit normalement `NODE_ENV=test`, si
`.env.test` n’existe pas, la valeur `NODE_ENV` de `.env` sélectionne le fichier
d’environnement correspondant. Vérifier que cette URL pointe vers une base
réservée aux tests, jamais vers une base de production.

## Code

- Script : [`backfill-move-fen.ts`](../../server/src/prisma/backfill-move-fen.ts)
- Service : [`moveService.ts`](../../server/src/service/moveService.ts)
- Repository : [`move.repository.ts`](../../server/src/repository/move.repository.ts)
- Test DB : [`db.integration.test.ts`](../../server/src/prisma/db.integration.test.ts)
