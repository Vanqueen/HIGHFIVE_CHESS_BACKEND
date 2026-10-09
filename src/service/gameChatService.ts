import { createGameMessage, findGameMessages } from "../repository/game-chat.repository";
import { GameService } from "./gameService";
import HttpError, { rethrowServiceError } from "./errorService";

export class GameChatService {
  static async getMessages(gameId: number, userId: number) {
    try {
      await GameService.getGameForUser(gameId, userId);
      return await findGameMessages(gameId);
    } catch (error) {
      rethrowServiceError(error, "Erreur lors de la récupération du chat de la partie :");
    }
  }

  static async sendMessage(gameId: number, userId: number, content: string) {
    try {
      const normalizedContent = content.trim();
      if (!normalizedContent || normalizedContent.length > 2000) {
        throw new HttpError("Le message doit contenir entre 1 et 2000 caractères.", 422, false);
      }
      await GameService.getGameForUser(gameId, userId);
      const message = await createGameMessage(gameId, userId, normalizedContent);
      if (!message) {
        throw new HttpError("Vous ne participez pas à cette partie.", 403, false);
      }
      return message;
    } catch (error) {
      rethrowServiceError(error, "Erreur lors de l'envoi du message :");
    }
  }
}
