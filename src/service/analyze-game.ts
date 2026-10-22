import "../config/environment";
import { db, connectDatabase } from "../prisma/db.ts";
import { analyzeGameById } from "./stockfishAnalysisWorker";

function parseGameId(args: string[]) {
  if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) {
    console.info("Usage: npm run stockfish:analyze -- <gameId>");
    return null;
  }
  if (args.length !== 1 || !/^[1-9]\d*$/.test(args[0] ?? "")) {
    throw new Error("Provide exactly one positive integer game ID. Use --help for usage.");
  }
  const gameId = Number(args[0]);
  if (!Number.isSafeInteger(gameId)) {
    throw new Error("The game ID must be a positive safe integer.");
  }
  return gameId;
}

async function main() {
  const gameId = parseGameId(process.argv.slice(2));
  if (gameId === null) return;

  try {
    await connectDatabase();
    const outcome = await analyzeGameById(gameId);
    switch (outcome) {
      case "ANALYZED":
        console.info(`[stockfish] Analysis saved for game ${gameId}.`);
        break;
      case "ALREADY_ANALYZED":
        console.info(`[stockfish] Game ${gameId} already has a saved analysis; nothing changed.`);
        break;
      case "GAME_NOT_FOUND":
        throw new Error(`Game ${gameId} was not found.`);
      case "GAME_NOT_FINISHED":
        throw new Error(`Game ${gameId} is not finished; only finished games can be analyzed.`);
    }
  } finally {
    await db.close();
  }
}

main().catch((error: unknown) => {
  console.error(
    "[stockfish] Targeted analysis failed:",
    error instanceof Error ? error.message : "Unknown error.",
  );
  process.exitCode = 1;
});
