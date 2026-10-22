import "../config/environment";

if (!process.argv.includes("--apply")) {
  console.error(
    "[data-repair] Cette commande modifie les coups existants. Relancez avec --apply pour confirmer.",
  );
  process.exitCode = 1;
} else {
  let connected = false;
  let closeDatabase: (() => Promise<void>) | undefined;
  try {
    const [{ MoveService }, { connectDatabase, db }] = await Promise.all([
      import("../service/moveService"),
      import("./db.ts"),
    ]);
    closeDatabase = () => db.close();
    await connectDatabase();
    connected = true;
    const result = await MoveService.backfillMissingFenBefore();
    console.info(
      `[data-repair] Coups examinés : ${result.scanned}; positions récupérées : ${result.updated}; ` +
        `positions à vérifier manuellement : ${result.unresolved}.`,
    );
    if (result.unresolved > 0) process.exitCode = 2;
  } catch (error) {
    console.error("[data-repair] Échec de la récupération des positions précédentes.", error);
    process.exitCode = 1;
  } finally {
    if (connected && closeDatabase) {
      try {
        await closeDatabase();
      } catch (error) {
        console.error("[data-repair] Échec de la fermeture de la connexion PostgreSQL.", error);
        process.exitCode = 1;
      }
    }
  }
}
