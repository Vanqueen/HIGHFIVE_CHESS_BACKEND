import { randomInt } from "node:crypto";
import {
  createMatchmakingGame,
  deleteMatchmakingGame,
  pairMatchmakingGames,
} from "../repository/matchmaking.repository";
import { signGuestGameToken } from "../utils/guestGameToken";
import HttpError, { rethrowServiceError } from "./errorService";

const MAX_INITIAL_TIME_SECONDS = 2 * 60 * 60;
const MAX_INCREMENT_SECONDS = 180;
const SESSION_LIFETIME_SECONDS = 12 * 60 * 60;

export class MatchmakingService {
  static async createQueueGame(
    initialTimeSeconds: number,
    incrementSeconds: number,
    userId: number | null,
  ) {
    try {
      if (
        !Number.isSafeInteger(initialTimeSeconds) ||
        initialTimeSeconds < 0 ||
        initialTimeSeconds > MAX_INITIAL_TIME_SECONDS ||
        !Number.isSafeInteger(incrementSeconds) ||
        incrementSeconds < 0 ||
        incrementSeconds > MAX_INCREMENT_SECONDS ||
        (initialTimeSeconds === 0 && incrementSeconds !== 0)
      ) {
        throw new HttpError("Contrôle du temps invalide.", 422, false);
      }
      const { game, participant } = await createMatchmakingGame(
        initialTimeSeconds,
        incrementSeconds,
        userId,
      );
      return {
        game,
        participant,
        ...(userId === null
          ? {
              guestSessionToken: signGuestGameToken({
                kind: "guest-session",
                gameId: game.id,
                participantId: participant.id,
              }, SESSION_LIFETIME_SECONDS),
            }
          : {}),
      };
    } catch (error) {
      rethrowServiceError(error, "Erreur lors de la création de la recherche de partie :");
    }
  }

  static async pair(
    waitingGameId: number,
    joiningGameId: number,
    joiningUserId: number | null,
  ) {
    try {
      const paired = await pairMatchmakingGames(
        waitingGameId,
        joiningGameId,
        joiningUserId,
        randomInt(2) === 0 ? "WHITE" : "BLACK",
      );
      if (!paired) throw new HttpError("Cette recherche de partie n'est plus disponible.", 409, false);
      return {
        ...paired,
        guestSessionTokens: Object.fromEntries(paired.participants
          .filter((participant) => participant.participantType === "GUEST")
          .map((participant) => [
            participant.id,
            signGuestGameToken({
                kind: "guest-session",
                gameId: paired.game.id,
                participantId: participant.id,
              }, SESSION_LIFETIME_SECONDS),
          ])),
      };
    } catch (error) {
      rethrowServiceError(error, "Erreur lors de l'appariement des joueurs :");
    }
  }

  static async cancelQueueGame(gameId: number) {
    try {
      return await deleteMatchmakingGame(gameId);
    } catch (error) {
      rethrowServiceError(error, "Erreur lors de l'annulation de la recherche :");
    }
  }
}
