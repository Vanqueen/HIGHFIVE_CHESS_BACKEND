import {
  createGameWithParticipants,
  findGame,
  type CreateGameData,
  type CreateGameParticipantData,
} from "../repository/game.repository";
import {
  findGameParticipantsByGameId,
  findGameParticipantsByUserId,
} from "../repository/game-participant.repository";
import {
  acceptUndoRequest,
  claimGameNoShow,
  clearUndoRequest,
  createUndoRequest,
  finishGame,
  finishGameOnTimeout,
  resolveDrawOffer,
  startGameClock,
  setDrawOffer,
} from "../repository/game-action.repository";
import { findMovesByGameId } from "../repository/move.repository";
import HttpError, { rethrowServiceError } from "./errorService";

type GameRecord = NonNullable<Awaited<ReturnType<typeof findGame>>>;
type GameActor = { userId: number } | { participantId: number };
type Timestamp = Date | { epochMilliseconds: number };

function epochMilliseconds(value: Timestamp) {
  return value instanceof Date ? value.getTime() : value.epochMilliseconds;
}

function findActorParticipant(
  participants: Awaited<ReturnType<typeof findGameParticipantsByGameId>>,
  actor: GameActor,
) {
  return participants.find((participant) =>
    "userId" in actor
      ? participant.userId === actor.userId && participant.participantType === "USER"
      : participant.id === actor.participantId &&
        participant.participantType === "GUEST" &&
        participant.userId === null
  );
}

function calculateClock(game: GameRecord, at = Date.now()) {
  let white = game.whiteTimeRemainingMs;
  let black = game.blackTimeRemainingMs;
  if (
    game.initialTimeSeconds > 0 &&
    game.status === "IN_PROGRESS" &&
    game.activeColor &&
    game.clockStartedAt
  ) {
    const elapsed = BigInt(Math.max(0, at - epochMilliseconds(game.clockStartedAt)));
    if (game.activeColor === "WHITE") {
      white = white > elapsed ? white - elapsed : 0n;
    } else {
      black = black > elapsed ? black - elapsed : 0n;
    }
  }
  return { white, black };
}

export class GameService {
  static async startWhenParticipantsReady(
    gameId: number,
    participantId: number,
    connectedParticipantIds: ReadonlySet<number>,
  ) {
    try {
      const game = await findGame(gameId);
      if (!game) throw new HttpError("Partie introuvable.", 404, false);
      const participants = await findGameParticipantsByGameId(gameId);
      if (!participants.some((participant) => participant.id === participantId)) {
        throw new HttpError("Vous ne participez pas à cette partie.", 403, false);
      }
      if (
        game.status !== "WAITING" ||
        participants.length !== 2 ||
        !participants.every((participant) => connectedParticipantIds.has(participant.id))
      ) {
        return { game, started: false };
      }

      const startedGame = await startGameClock(gameId);
      if (startedGame) return { game: startedGame, started: true };
      const latestGame = await findGame(gameId);
      if (!latestGame) throw new HttpError("Partie introuvable après son démarrage.", 500, false);
      return { game: latestGame, started: false };
    } catch (error) {
      rethrowServiceError(error, "Erreur lors du démarrage de la partie :");
    }
  }

  static async startWhenReady(
    gameId: number,
    userId: number,
    connectedUserIds: ReadonlySet<number>,
  ) {
    try {
      const game = await findGame(gameId);
      if (!game) throw new HttpError("Partie introuvable.", 404, false);
      const participants = await findGameParticipantsByGameId(gameId);
      if (!participants.some((participant) => participant.userId === userId)) {
        throw new HttpError("Vous ne participez pas à cette partie.", 403, false);
      }
      if (game.status !== "WAITING") return { game, started: false };
      if (participants.length !== 2) return { game, started: false };

      const playerIds = participants
        .filter((participant) => participant.participantType === "USER")
        .map((participant) => participant.userId)
        .filter((participantId): participantId is number => participantId !== null);
      if (playerIds.length === 0 || !playerIds.every((id) => connectedUserIds.has(id))) {
        return { game, started: false };
      }

      const startedGame = await startGameClock(gameId);
      if (startedGame) return { game: startedGame, started: true };
      const latestGame = await findGame(gameId);
      if (!latestGame) throw new HttpError("Partie introuvable après son démarrage.", 500, false);
      return { game: latestGame, started: false };
    } catch (error) {
      rethrowServiceError(error, "Erreur lors du démarrage de la partie :");
    }
  }

  static async createGame(
    gameData: CreateGameData,
    participants: CreateGameParticipantData[],
  ) {
    try {
      if (!participants.length || participants.length > 2) {
        throw new HttpError("Une partie doit avoir un ou deux participants.", 422, false);
      }

      const colors = participants.map((participant) => participant.color);
      if (new Set(colors).size !== colors.length) {
        throw new HttpError("Chaque couleur ne peut être attribuée qu'une seule fois.", 422, false);
      }

      if (gameData.status && gameData.status !== "WAITING") {
        throw new HttpError("Une nouvelle partie doit commencer au statut WAITING.", 422, false);
      }
      if (gameData.initialTimeSeconds < 0 || (gameData.incrementSeconds ?? 0) < 0) {
        throw new HttpError("La durée et l'incrément de l'horloge ne peuvent pas être négatifs.", 422, false);
      }

      return await createGameWithParticipants(gameData, participants);
    } catch (error) {
      rethrowServiceError(error, "Erreur lors de la création de la partie :");
    }
  }

  static async getGame(gameId: number) {
    try {
      const game = await findGame(gameId);
      if (!game) {
        throw new HttpError("Partie introuvable.", 404, false);
      }

      const participants = await findGameParticipantsByGameId(gameId);
      return { game, participants };
    } catch (error) {
      rethrowServiceError(error, "Erreur lors de la récupération de la partie :");
    }
  }

  static offerDraw(gameId: number, userId: number) {
    return this.offerDrawForActor(gameId, { userId });
  }

  static offerDrawAsParticipant(gameId: number, participantId: number) {
    return this.offerDrawForActor(gameId, { participantId });
  }

  private static async offerDrawForActor(gameId: number, actor: GameActor) {
    try {
      const { game } = await this.getClock(gameId);
      if (game.status !== "IN_PROGRESS") {
        throw new HttpError("La partie n'accepte pas d'offre de nulle.", 409, false);
      }
      const participants = await findGameParticipantsByGameId(gameId);
      const participant = findActorParticipant(participants, actor);
      if (!participant) throw new HttpError("Vous ne participez pas à cette partie.", 403, false);
      if (game.pendingUndoParticipantId !== null) {
        throw new HttpError("Une demande d'annulation est déjà en attente.", 409, false);
      }
      if (game.drawOfferParticipantId !== null) {
        throw new HttpError("Une offre de nulle est déjà en attente.", 409, false);
      }
      const updated = await setDrawOffer(gameId, participant.id);
      if (!updated) throw new HttpError("La partie a changé. Réessayez.", 409, false);
      return { game: await findGame(gameId), offeredBy: participant.id };
    } catch (error) {
      rethrowServiceError(error, "Erreur lors de l'offre de nulle :");
    }
  }

  static respondToDraw(gameId: number, userId: number, accept: boolean) {
    return this.respondToDrawForActor(gameId, { userId }, accept);
  }

  static respondToDrawAsParticipant(gameId: number, participantId: number, accept: boolean) {
    return this.respondToDrawForActor(gameId, { participantId }, accept);
  }

  private static async respondToDrawForActor(gameId: number, actor: GameActor, accept: boolean) {
    try {
      const { game } = await this.getClock(gameId);
      if (game.status !== "IN_PROGRESS" || game.drawOfferParticipantId === null) {
        throw new HttpError("Aucune offre de nulle n'est en attente.", 409, false);
      }
      const participants = await findGameParticipantsByGameId(gameId);
      const participant = findActorParticipant(participants, actor);
      if (!participant) throw new HttpError("Vous ne participez pas à cette partie.", 403, false);
      if (participant.id === game.drawOfferParticipantId) {
        throw new HttpError("Vous ne pouvez pas répondre à votre propre offre.", 409, false);
      }
      const clock = calculateClock(game);
      const updated = await resolveDrawOffer(
        gameId,
        game.drawOfferParticipantId,
        accept,
        clock.white,
        clock.black,
      );
      if (!updated) throw new HttpError("L'offre de nulle a déjà été traitée.", 409, false);
      return {
        accepted: accept,
        game: await findGame(gameId),
      };
    } catch (error) {
      rethrowServiceError(error, "Erreur lors de la réponse à l'offre de nulle :");
    }
  }

  static resign(gameId: number, userId: number) {
    return this.resignForActor(gameId, { userId });
  }

  static resignAsParticipant(gameId: number, participantId: number) {
    return this.resignForActor(gameId, { participantId });
  }

  private static async resignForActor(gameId: number, actor: GameActor) {
    try {
      const { game } = await this.getClock(gameId);
      if (game.status !== "IN_PROGRESS") {
        throw new HttpError("La partie n'est pas en cours.", 409, false);
      }
      const participants = await findGameParticipantsByGameId(gameId);
      const participant = findActorParticipant(participants, actor);
      if (!participant) throw new HttpError("Vous ne participez pas à cette partie.", 403, false);

      const clock = calculateClock(game);
      const finished = await finishGame(gameId, {
        result: participant.color === "WHITE" ? "BLACK_WIN" : "WHITE_WIN",
        terminationReason: "RESIGNATION",
        whiteTimeRemainingMs: clock.white,
        blackTimeRemainingMs: clock.black,
      });
      if (!finished) throw new HttpError("La partie a changé. Réessayez.", 409, false);
      return await findGame(gameId);
    } catch (error) {
      rethrowServiceError(error, "Erreur lors de l'abandon de la partie :");
    }
  }

  static requestUndo(gameId: number, userId: number) {
    return this.requestUndoForActor(gameId, { userId });
  }

  static requestUndoAsParticipant(gameId: number, participantId: number) {
    return this.requestUndoForActor(gameId, { participantId });
  }

  private static async requestUndoForActor(gameId: number, actor: GameActor) {
    try {
      const { game } = await this.getClock(gameId);
      if (game.type !== "LOCAL" || game.status !== "IN_PROGRESS") {
        throw new HttpError("L'annulation est réservée aux parties locales en cours.", 409, false);
      }
      const participants = await findGameParticipantsByGameId(gameId);
      const participant = findActorParticipant(participants, actor);
      if (!participant) throw new HttpError("Vous ne participez pas à cette partie.", 403, false);
      if (participants.length !== 2) {
        throw new HttpError("L'annulation nécessite deux participants.", 409, false);
      }
      if (game.drawOfferParticipantId !== null) {
        throw new HttpError("Une offre de nulle est déjà en attente.", 409, false);
      }
      if ((await findMovesByGameId(gameId)).length === 0) {
        throw new HttpError("Aucun coup n'est disponible pour une annulation.", 409, false);
      }
      if (game.pendingUndoParticipantId !== null) {
        throw new HttpError("Une demande d'annulation est déjà en attente.", 409, false);
      }
      const updated = await createUndoRequest(gameId, game.currentFen, participant.id);
      if (!updated) throw new HttpError("La partie a changé. Réessayez.", 409, false);
      return { game: await findGame(gameId), requestedBy: participant.id };
    } catch (error) {
      rethrowServiceError(error, "Erreur lors de la demande d'annulation :");
    }
  }

  static respondToUndo(gameId: number, userId: number, accept: boolean) {
    return this.respondToUndoForActor(gameId, { userId }, accept);
  }

  static respondToUndoAsParticipant(gameId: number, participantId: number, accept: boolean) {
    return this.respondToUndoForActor(gameId, { participantId }, accept);
  }

  static claimNoShow(
    gameId: number,
    userId: number,
    outcome: "DRAW" | "CANCEL" | "WIN",
  ) {
    return this.claimNoShowForActor(gameId, { userId }, outcome);
  }

  static claimNoShowAsParticipant(
    gameId: number,
    participantId: number,
    outcome: "DRAW" | "CANCEL" | "WIN",
  ) {
    return this.claimNoShowForActor(gameId, { participantId }, outcome);
  }

  private static async claimNoShowForActor(
    gameId: number,
    actor: GameActor,
    outcome: "DRAW" | "CANCEL" | "WIN",
  ) {
    try {
      let game = await findGame(gameId);
      if (!game) throw new HttpError("Partie introuvable.", 404, false);
      const participants = await findGameParticipantsByGameId(gameId);
      const claimant = findActorParticipant(participants, actor);
      if (!claimant) throw new HttpError("Vous ne participez pas à cette partie.", 403, false);
      if (
        participants.length !== 2 ||
        !participants.some((participant) => participant.color === "WHITE")
      ) {
        throw new HttpError("La partie ne contient pas deux participants valides.", 409, false);
      }
      if (claimant.color !== "BLACK") {
        throw new HttpError("Seul le joueur attendant le premier coup peut signaler l'absence.", 403, false);
      }
      if (game.type === "TOURNAMENT" && claimant.participantType !== "USER") {
        throw new HttpError("Les tournois sont réservés aux joueurs authentifiés.", 403, false);
      }
      if (outcome === "WIN" && game.type !== "TOURNAMENT") {
        throw new HttpError("La victoire par absence est réservée aux parties de tournoi.", 422, false);
      }
      if (outcome === "CANCEL" && game.type === "TOURNAMENT") {
        throw new HttpError("Une partie de tournoi ne peut pas être annulée pour absence.", 422, false);
      }
      await this.getClock(gameId);
      game = await findGame(gameId);
      if (!game) throw new HttpError("Partie introuvable.", 404, false);
      if (
        game.status !== "IN_PROGRESS" ||
        game.activeColor !== "WHITE" ||
        !game.startedAt ||
        Date.now() - epochMilliseconds(game.startedAt) < 60_000
      ) {
        throw new HttpError("Le délai d'absence d'une minute n'est pas encore atteint.", 409, false);
      }

      const result = await claimGameNoShow(gameId, claimant.id, outcome, game.startedAt);
      if (!result) {
        throw new HttpError("La partie a changé ou le premier coup a déjà été joué.", 409, false);
      }
      return result;
    } catch (error) {
      rethrowServiceError(error, "Erreur lors du signalement d'absence :");
    }
  }

  private static async respondToUndoForActor(gameId: number, actor: GameActor, accept: boolean) {
    try {
      const { game } = await this.getClock(gameId);
      if (
        game.type !== "LOCAL" ||
        game.status !== "IN_PROGRESS" ||
        game.pendingUndoParticipantId === null
      ) {
        throw new HttpError("Aucune demande d'annulation n'est en attente.", 409, false);
      }
      const participants = await findGameParticipantsByGameId(gameId);
      const responder = findActorParticipant(participants, actor);
      if (!responder) throw new HttpError("Vous ne participez pas à cette partie.", 403, false);
      if (responder.id === game.pendingUndoParticipantId) {
        throw new HttpError("Seul l'autre joueur peut répondre à cette demande.", 409, false);
      }

      if (!accept) {
        const cleared = await clearUndoRequest(
          gameId,
          game.pendingUndoParticipantId,
          game.currentFen,
        );
        if (!cleared) throw new HttpError("La demande a déjà été traitée.", 409, false);
        return { accepted: false, game: await findGame(gameId) };
      }

      const moves = await findMovesByGameId(gameId);
      const latestMove = moves.at(-1);
      if (!latestMove) throw new HttpError("Aucun coup à annuler.", 409, false);
      if (!latestMove.fenBefore) {
        throw new HttpError(
          "La position précédente de ce coup n'est pas enregistrée et ne peut pas être restaurée.",
          409,
          false,
        );
      }
      const lastMover = participants.find((row) => row.id === latestMove.participantId);
      if (!lastMover) throw new HttpError("Le participant du dernier coup est introuvable.", 500, false);
      const clock = calculateClock(game);
      const result = await acceptUndoRequest(
        gameId,
        game.currentFen,
        game.pendingUndoParticipantId,
        latestMove.fenBefore,
        lastMover.color,
        clock.white,
        clock.black,
      );
      if (!result) throw new HttpError("La partie a changé. Réessayez.", 409, false);
      return { accepted: true, game: result.game, undoneMove: result.move };
    } catch (error) {
      rethrowServiceError(error, "Erreur lors de la réponse à la demande d'annulation :");
    }
  }

  static async getClock(gameId: number) {
    try {
      const game = await findGame(gameId);
      if (!game) throw new HttpError("Partie introuvable.", 404, false);
      const clock = calculateClock(game);
      if (
        game.initialTimeSeconds > 0 &&
        game.status === "IN_PROGRESS" &&
        game.activeColor &&
        clock[game.activeColor === "WHITE" ? "white" : "black"] <= 0n
      ) {
        const result = await finishGameOnTimeout(
          game.id,
          game.currentFen,
          game.activeColor,
          clock.white,
          clock.black,
        );
        if (result) {
          const updatedGame = await findGame(gameId);
          if (!updatedGame) throw new HttpError("Partie introuvable après expiration.", 500, false);
          return {
            game: updatedGame,
            whiteTimeRemainingMs: updatedGame.whiteTimeRemainingMs.toString(),
            blackTimeRemainingMs: updatedGame.blackTimeRemainingMs.toString(),
            expired: true,
          };
        }
        throw new HttpError("La partie a changé pendant la synchronisation de l'horloge.", 409, false);
      }
      return {
        game,
        whiteTimeRemainingMs: clock.white.toString(),
        blackTimeRemainingMs: clock.black.toString(),
        expired: false,
      };
    } catch (error) {
      rethrowServiceError(error, "Erreur lors de la synchronisation de l'horloge :");
    }
  }

  static async getGameForUser(gameId: number, userId: number) {
    try {
      const game = await findGame(gameId);
      if (!game) {
        throw new HttpError("Partie introuvable.", 404, false);
      }

      const participants = await findGameParticipantsByGameId(gameId);
      if (!participants.some((participant) =>
        participant.userId === userId && participant.participantType === "USER"
      )) {
        throw new HttpError("Vous ne participez pas à cette partie.", 403, false);
      }

      return { game, participants };
    } catch (error) {
      rethrowServiceError(error, "Erreur lors de la vérification de l'accès à la partie :");
    }
  }

  static async getGameForGuest(gameId: number, participantId: number) {
    try {
      const game = await findGame(gameId);
      if (!game) throw new HttpError("Partie introuvable.", 404, false);
      const participants = await findGameParticipantsByGameId(gameId);
      if (!participants.some(
        (participant) =>
          participant.id === participantId &&
          participant.participantType === "GUEST" &&
          participant.userId === null,
      )) {
        throw new HttpError("Vous ne participez pas à cette partie.", 403, false);
      }
      return { game, participants };
    } catch (error) {
      rethrowServiceError(error, "Erreur lors de la vérification du joueur invité :");
    }
  }

  static async getGamesForUser(userId: number, limit = 100) {
    try {
      const participantRows = await findGameParticipantsByUserId(userId, limit);
      const gameIds = [...new Set(participantRows.map((participant) => participant.gameId))];
      const games = await Promise.all(
        gameIds.map(async (gameId) => {
          const game = await findGame(gameId);
          return game ? game : null;
        }),
      );

      return games.filter((game) => game !== null);
    } catch (error) {
      rethrowServiceError(error, "Erreur lors de la récupération des parties de l'utilisateur :");
    }
  }
}
