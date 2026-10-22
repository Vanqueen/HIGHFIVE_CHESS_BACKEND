import "../config/environment";
import { verifyStockfishConfiguration } from "./stockfishAnalysisWorker";

try {
  const result = await verifyStockfishConfiguration();
  console.info(
    `[stockfish] UCI check passed: ${result.engineVersion}, depth ${result.depth}, best move ${result.bestMove}.`,
  );
} catch (error) {
  console.error("[stockfish] UCI check failed:", error);
  process.exitCode = 1;
}
