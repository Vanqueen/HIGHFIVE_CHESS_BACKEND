import { Chess } from "chess.js";
import { findGame } from "../repository/game.repository";
import { findGameParticipantsByGameId } from "../repository/game-participant.repository";
import {
  appendMove,
  backfillMoveFenBefore,
  findMoveByGameAndPly,
  findMovesMissingFenBefore,
  findMovesByGameId,
} from "../repository/move.repository";
import { finishGameOnTimeout } from "../repository/game-action.repository";
import HttpError, { rethrowServiceError } from "./errorService";

type Promotion = "QUEEN" | "ROOK" | "BISHOP" | "KNIGHT";

const promotionSymbols: Record<Promotion, "q" | "r" | "b" | "n"> = {
  QUEEN: "q",
  ROOK: "r",
  BISHOP: "b",
  KNIGHT: "n",
};

const STANDARD_START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export class MoveService {
  static async backfillMissingFenBefore() {
    try {
      const missingPositions = await findMovesMissingFenBefore();
      let updated = 0;
      let unresolved = 0;

      for (const move of missingPositions) {
        let fenBefore: string | null = null;
        if (move.ply > 1) {
          const previousMove = await findMoveByGameAndPly(move.gameId, move.ply - 1);
          fenBefore = previousMove?.fenAfter ?? null;
        } else if (move.ply === 1) {
          const chess = new Chess(STANDARD_START_FEN);
          try {
            chess.move({
              from: move.from,
              to: move.to,
              ...(move.promotion ? { promotion: promotionSymbols[move.promotion] } : {}),
            });
            if (chess.fen() === move.fenAfter) fenBefore = STANDARD_START_FEN;
          } catch {
            fenBefore = null;
          }
        }

        if (fenBefore && await backfillMoveFenBefore(move.id, fenBefore)) {
          updated += 1;
        } else {
          unresolved += 1;
        }
      }

      return { scanned: missingPositions.length, updated, unresolved };
    } catch (error) {
      rethrowServiceError(error, "Erreur lors de la récupération des positions précédentes :");
    }
  }

  static async playMove(
    gameId: number,
    userId: number,
    input: { from: string; to: string; promotion?: Promotion },
  ) {
    return this.playMoveInternal(gameId, { userId }, input);
  }

  static async playMoveAsParticipant(
    gameId: number,
    participantId: number,
    input: { from: string; to: string; promotion?: Promotion },
  ) {
    return this.playMoveInternal(gameId, { participantId }, input);
  }

  private static async playMoveInternal(
    gameId: number,
    player: { userId: number } | { participantId: number },
    input: { from: string; to: string; promotion?: Promotion },
  ) {
    try {
      if (!/^[a-h][1-8]$/.test(input.from) || !/^[a-h][1-8]$/.test(input.to)) {
        throw new HttpError("Cases de départ ou d'arrivée invalides.", 422, false);
      }
      if (input.promotion && !(input.promotion in promotionSymbols)) {
        throw new HttpError("Pièce de promotion invalide.", 422, false);
      }

      const game = await findGame(gameId);
      if (!game) {
        throw new HttpError("Partie introuvable.", 404, false);
      }
      if (game.status !== "WAITING" && game.status !== "IN_PROGRESS") {
        throw new HttpError("Cette partie n'accepte plus de coups.", 409, false);
      }
      if (game.pendingUndoParticipantId != null) {
        throw new HttpError("Un coup ne peut pas être joué pendant une demande d'annulation.", 409, false);
      }

      const participants = await findGameParticipantsByGameId(gameId);
      if (participants.length !== 2) {
        throw new HttpError("La partie doit avoir deux participants pour commencer.", 409, false);
      }
      const participant = participants.find((candidate) =>
        "userId" in player
          ? candidate.userId === player.userId && candidate.participantType === "USER"
          : candidate.id === player.participantId &&
            candidate.participantType === "GUEST" &&
            candidate.userId === null,
      );
      if (!participant) {
        throw new HttpError("Vous ne participez pas à cette partie.", 403, false);
      }

      let chess: Chess;
      try {
        chess = new Chess(game.currentFen);
      } catch {
        throw new HttpError("La position enregistrée pour cette partie est invalide.", 500, false);
      }

      const expectedActiveColor = game.activeColor;
      if (game.status === "WAITING") {
        if (game.activeColor !== null || chess.turn() !== "w") {
          throw new HttpError("L'état initial de cette partie est invalide.", 409, false);
        }
      } else if (
        (game.activeColor === "WHITE" && chess.turn() !== "w") ||
        (game.activeColor === "BLACK" && chess.turn() !== "b") ||
        game.activeColor === null
      ) {
        throw new HttpError("Le tour actif de cette partie est invalide.", 409, false);
      }

      const movingColor = chess.turn() === "w" ? "WHITE" : "BLACK";
      if (participant.color !== movingColor) {
        throw new HttpError("Ce n'est pas votre tour.", 409, false);
      }

      const now = new Date();
      let whiteTimeRemainingMs = game.whiteTimeRemainingMs;
      let blackTimeRemainingMs = game.blackTimeRemainingMs;
      if (game.initialTimeSeconds > 0 && game.status === "IN_PROGRESS" && game.clockStartedAt) {
        const elapsedMs = BigInt(Math.max(0, now.getTime() - game.clockStartedAt.getTime()));
        if (movingColor === "WHITE") {
          whiteTimeRemainingMs =
            whiteTimeRemainingMs > elapsedMs ? whiteTimeRemainingMs - elapsedMs : 0n;
        } else {
          blackTimeRemainingMs =
            blackTimeRemainingMs > elapsedMs ? blackTimeRemainingMs - elapsedMs : 0n;
        }
        const movingTime = movingColor === "WHITE" ? whiteTimeRemainingMs : blackTimeRemainingMs;
        if (movingTime <= 0n) {
          const finished = await finishGameOnTimeout(
            gameId,
            game.currentFen,
            movingColor,
            whiteTimeRemainingMs,
            blackTimeRemainingMs,
          );
          if (!finished) {
            throw new HttpError("La partie a changé. Rechargez son état.", 409, false);
          }
          const timedOutGame = await findGame(gameId);
          if (!timedOutGame) throw new HttpError("Partie introuvable après expiration.", 500, false);
          return { timedOut: true as const, game: timedOutGame };
        }
      }

      let playedMove;
      try {
        playedMove = chess.move({
          from: input.from,
          to: input.to,
          ...(input.promotion ? { promotion: promotionSymbols[input.promotion] } : {}),
        });
      } catch {
        throw new HttpError("Coup illégal pour la position actuelle.", 422, false);
      }

      const pastMoves = await findMovesByGameId(gameId);
      const ply = pastMoves.length + 1;

      const historyChess = new Chess(STANDARD_START_FEN);
      for (const pastMove of pastMoves) {
        const move = historyChess.move({
          from: pastMove.from,
          to: pastMove.to,
          ...(pastMove.promotion ? { promotion: promotionSymbols[pastMove.promotion as Promotion] } : {}),
        });
        if (!move) {
          throw new HttpError("L'historique de la partie est incohérent pour la détection de répétition.", 500, false);
        }
      }
      const currentHistoryMove = historyChess.move({
        from: input.from,
        to: input.to,
        ...(input.promotion ? { promotion: promotionSymbols[input.promotion] } : {}),
      });
      if (!currentHistoryMove) {
        throw new HttpError("Le coup joué est incohérent avec l'historique de la partie.", 500, false);
      }

      let status: "IN_PROGRESS" | "FINISHED" = "IN_PROGRESS";
      let result: "WHITE_WIN" | "BLACK_WIN" | "DRAW" | null = null;
      let terminationReason:
        | "CHECKMATE"
        | "STALEMATE"
        | "THREEFOLD_REPETITION"
        | "FIFTY_MOVE_RULE"
        | "INSUFFICIENT_MATERIAL"
        | null = null;

      if (chess.isCheckmate()) {
        status = "FINISHED";
        result = movingColor === "WHITE" ? "WHITE_WIN" : "BLACK_WIN";
        terminationReason = "CHECKMATE";
      } else if (chess.isStalemate()) {
        status = "FINISHED";
        result = "DRAW";
        terminationReason = "STALEMATE";
      } else if (historyChess.isThreefoldRepetition()) {
        status = "FINISHED";
        result = "DRAW";
        terminationReason = "THREEFOLD_REPETITION";
      } else if (chess.isInsufficientMaterial()) {
        status = "FINISHED";
        result = "DRAW";
        terminationReason = "INSUFFICIENT_MATERIAL";
      } else if (chess.isDrawByFiftyMoves()) {
        status = "FINISHED";
        result = "DRAW";
        terminationReason = "FIFTY_MOVE_RULE";
      }

      if (game.initialTimeSeconds > 0) {
        const incrementMs = BigInt(game.incrementSeconds) * 1000n;
        if (movingColor === "WHITE") {
          whiteTimeRemainingMs += incrementMs;
        } else {
          blackTimeRemainingMs += incrementMs;
        }
      }

      return await appendMove(
        gameId,
        game.currentFen,
        game.status,
        expectedActiveColor,
        {
          gameId,
          participantId: participant.id,
          ply,
          moveNumber: playedMove.color === "w" ? chess.moveNumber() : chess.moveNumber() - 1,
          san: playedMove.san,
          from: playedMove.from,
          to: playedMove.to,
          promotion: input.promotion ?? null,
          fenBefore: game.currentFen,
          fenAfter: chess.fen(),
          playedAt: now,
        },
        {
          currentFen: chess.fen(),
          activeColor: status === "FINISHED" ? null : chess.turn() === "w" ? "WHITE" : "BLACK",
          status,
          result,
          terminationReason,
          ...(game.status === "WAITING" ? { startedAt: now } : {}),
          ...(status === "FINISHED" ? { endedAt: now } : {}),
          lastActivityAt: now,
          lastMoveAt: now,
          clockStartedAt: status === "FINISHED" ? null : now,
          whiteTimeRemainingMs,
          blackTimeRemainingMs,
        },
      );
    } catch (error) {
      rethrowServiceError(error, "Erreur lors de l'enregistrement du coup :");
    }
  }

  static async getMoves(gameId: number, userId: number) {
    try {
      const game = await findGame(gameId);
      if (!game) {
        throw new HttpError("Partie introuvable.", 404, false);
      }
      const participants = await findGameParticipantsByGameId(gameId);
      if (!participants.some((participant) => participant.userId === userId)) {
        throw new HttpError("Vous ne participez pas à cette partie.", 403, false);
      }
      return await findMovesByGameId(gameId);
    } catch (error) {
      rethrowServiceError(error, "Erreur lors de la récupération des coups :");
    }
  }

  static async getMovesForGuest(gameId: number, participantId: number) {
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
      return await findMovesByGameId(gameId);
    } catch (error) {
      rethrowServiceError(error, "Erreur lors de la récupération des coups du joueur invité :");
    }
  }
}
