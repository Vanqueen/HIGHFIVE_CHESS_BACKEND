import { findGameAnalysesByGameId } from "../repository/game-analysis.repository";
import { GameService } from "./gameService";
import { enqueueGameAnalysis } from "./stockfishAnalysisWorker";
import HttpError, { rethrowServiceError } from "./errorService";

export class GameAnalysisService {
  static async getForUser(gameId: number, userId: number) {
    try {
      const { game } = await GameService.getGameForUser(gameId, userId);
      if (game.status !== "FINISHED") {
        throw new HttpError("L'analyse sera disponible après la fin de la partie.", 409, false);
      }
      const analyses = await findGameAnalysesByGameId(gameId);
      if (analyses.length === 0 && !enqueueGameAnalysis(gameId)) {
        throw new HttpError("Le moteur Stockfish n'est pas configuré sur le serveur.", 503, false);
      }
      return { status: analyses.length > 0 ? "READY" : "PENDING", analyses };
    } catch (error) {
      rethrowServiceError(error, "Erreur lors de la récupération de l'analyse de partie :");
    }
  }

  static async requestForUser(gameId: number, userId: number) {
    try {
      const { game } = await GameService.getGameForUser(gameId, userId);
      if (game.status !== "FINISHED") {
        throw new HttpError("L'analyse est disponible uniquement après la fin de la partie.", 409, false);
      }
      const analyses = await findGameAnalysesByGameId(gameId);
      if (analyses.length > 0) return { status: "READY", analyses };
      if (!enqueueGameAnalysis(gameId)) {
        throw new HttpError("Le moteur Stockfish n'est pas configuré sur le serveur.", 503, false);
      }
      return { status: "PENDING", analyses: [] };
    } catch (error) {
      rethrowServiceError(error, "Erreur lors de la demande d'analyse de partie :");
    }
  }
}
