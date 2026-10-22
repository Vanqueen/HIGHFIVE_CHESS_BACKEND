import { db } from "../prisma/db.ts";
import { finalizeGameFinishedEffects, publishGameFinishedNotifications } from "../service/gameFinishedEffects";
import type { NotificationBroadcast } from "../events/notification.broadcast";
import { Temporal } from "temporal-polyfill";
import { hasAffectedRows } from "./affected-rows";

export async function startGameClock(gameId: number) {
  const now = Temporal.Now.instant();
  return db.orm.public.Game
    .where({
      id: gameId,
      status: "WAITING",
      activeColor: null,
      clockStartedAt: null,
    })
    .update({
      status: "IN_PROGRESS",
      activeColor: "WHITE",
      startedAt: now,
      clockStartedAt: now,
      lastActivityAt: now,
    });
}

export async function setDrawOffer(gameId: number, participantId: number) {
  const now = Temporal.Now.instant();
  return db.orm.public.Game
    .where({ id: gameId, status: "IN_PROGRESS", drawOfferParticipantId: null })
    .update({ drawOfferParticipantId: participantId, lastActivityAt: now });
}

export async function resolveDrawOffer(
  gameId: number,
  offeringParticipantId: number,
  accept: boolean,
  whiteTimeRemainingMs: bigint,
  blackTimeRemainingMs: bigint,
) {
  const now = Temporal.Now.instant();
  const notifications: NotificationBroadcast[] = [];
  const updatedGame = await db.transaction(async (tx) => {
    const locked = await tx.orm.public.Game.where({ id: gameId })
      .update({ lastActivityAt: now });
    if (!hasAffectedRows(locked)) return null;
    const currentGame = await tx.orm.public.Game.where({ id: gameId }).first();
    if (
      !currentGame ||
      currentGame.status !== "IN_PROGRESS" ||
      currentGame.drawOfferParticipantId !== offeringParticipantId
    ) {
      return null;
    }

    const updatedGame = await tx.orm.public.Game
      .where({
        id: gameId,
        status: "IN_PROGRESS",
        drawOfferParticipantId: offeringParticipantId,
      })
      .update(accept
        ? {
            status: "FINISHED",
            result: "DRAW",
            terminationReason: "AGREEMENT",
            endedAt: now,
            activeColor: null,
            clockStartedAt: null,
            whiteTimeRemainingMs,
            blackTimeRemainingMs,
            drawOfferParticipantId: null,
            pendingUndoParticipantId: null,
            lastActivityAt: now,
          }
        : {
            drawOfferParticipantId: null,
            lastActivityAt: now,
          });
    if (!hasAffectedRows(updatedGame)) return null;
    if (!accept) return updatedGame;

    const finalizedGame = await tx.orm.public.Game.where({ id: gameId }).first();
    if (
      finalizedGame &&
      (finalizedGame.status === "FINISHED" || finalizedGame.status === "CANCELLED")
    ) {
      notifications.push(...await finalizeGameFinishedEffects(tx, {
        id: finalizedGame.id,
        type: finalizedGame.type,
        status: finalizedGame.status,
        isRated: finalizedGame.isRated,
        ratingCategory: finalizedGame.ratingCategory,
        result: finalizedGame.result,
        tournamentRoundId: finalizedGame.tournamentRoundId,
      }, await tx.orm.public.GameParticipant.where({ gameId }).all()));
    }
    return updatedGame;
  });
  publishGameFinishedNotifications(notifications);
  return updatedGame;
}

export async function finishGame(
  gameId: number,
  updates: {
    result: "WHITE_WIN" | "BLACK_WIN" | "DRAW";
    terminationReason: "RESIGNATION" | "TIMEOUT";
    activeColor?: "WHITE" | "BLACK" | null;
    clockStartedAt?: ReturnType<typeof Temporal.Now.instant> | null;
    whiteTimeRemainingMs?: bigint;
    blackTimeRemainingMs?: bigint;
  },
) {
  const now = Temporal.Now.instant();
  const notifications: NotificationBroadcast[] = [];
  const updatedGame = await db.transaction(async (tx) => {
    const locked = await tx.orm.public.Game.where({ id: gameId })
      .update({ lastActivityAt: now });
    if (!hasAffectedRows(locked)) return null;
    const currentGame = await tx.orm.public.Game.where({ id: gameId }).first();
    if (!currentGame || currentGame.status !== "IN_PROGRESS") return null;

    const updatedGame = await tx.orm.public.Game
      .where({ id: gameId, status: "IN_PROGRESS" })
      .update({
        status: "FINISHED",
        ...updates,
        endedAt: now,
        activeColor: null,
        clockStartedAt: null,
        drawOfferParticipantId: null,
        pendingUndoParticipantId: null,
        lastActivityAt: now,
      });
    if (!hasAffectedRows(updatedGame)) return null;

    const finalizedGame = await tx.orm.public.Game.where({ id: gameId }).first();
    if (
      finalizedGame &&
      (finalizedGame.status === "FINISHED" || finalizedGame.status === "CANCELLED")
    ) {
      notifications.push(...await finalizeGameFinishedEffects(tx, {
        id: finalizedGame.id,
        type: finalizedGame.type,
        status: finalizedGame.status,
        isRated: finalizedGame.isRated,
        ratingCategory: finalizedGame.ratingCategory,
        result: finalizedGame.result,
        tournamentRoundId: finalizedGame.tournamentRoundId,
      }, await tx.orm.public.GameParticipant.where({ gameId }).all()));
    }
    return updatedGame;
  });
  publishGameFinishedNotifications(notifications);
  return updatedGame;
}

export async function claimGameNoShow(
  gameId: number,
  participantId: number,
  outcome: "DRAW" | "CANCEL" | "WIN",
  expectedStartedAt: ReturnType<typeof Temporal.Now.instant>,
) {
  const notifications: NotificationBroadcast[] = [];
  const finalGame = await db.transaction(async (tx) => {
    const now = Temporal.Now.instant();
    const game = await tx.orm.public.Game
      .where({
        id: gameId,
        status: "IN_PROGRESS",
        activeColor: "WHITE",
        startedAt: expectedStartedAt,
      })
      .first();
    if (!game || now.epochMilliseconds - game.startedAt!.epochMilliseconds < 60_000) return null;

    const claimant = await tx.orm.public.GameParticipant
      .where({ id: participantId, gameId, color: "BLACK" })
      .first();
    if (!claimant) return null;
    const absentPlayer = await tx.orm.public.GameParticipant
      .where({ gameId, color: "WHITE" })
      .first();
    if (!absentPlayer || absentPlayer.id === claimant.id) return null;
    if (outcome === "WIN" && game.type !== "TOURNAMENT") return null;
    if (outcome === "CANCEL" && game.type === "TOURNAMENT") return null;

    // Lock the game row before checking Move so a simultaneous first move cannot also commit.
    const locked = await tx.orm.public.Game
      .where({
        id: gameId,
        status: "IN_PROGRESS",
        activeColor: "WHITE",
        currentFen: game.currentFen,
        startedAt: expectedStartedAt,
      })
      .update({ lastActivityAt: now });
    if (!hasAffectedRows(locked)) return null;

    const currentGame = await tx.orm.public.Game.where({ id: gameId }).first();
    if (
      !currentGame ||
      currentGame.status !== "IN_PROGRESS" ||
      currentGame.activeColor !== "WHITE" ||
      currentGame.currentFen !== game.currentFen ||
      currentGame.startedAt?.epochMilliseconds !== expectedStartedAt.epochMilliseconds
    ) {
      return null;
    }

    const moves = await tx.orm.public.Move.where({ gameId }).all();
    if (moves.length > 0) return null;

    const finalGame = await tx.orm.public.Game
      .where({
        id: gameId,
        status: "IN_PROGRESS",
        activeColor: "WHITE",
        currentFen: game.currentFen,
        startedAt: expectedStartedAt,
      })
      .update(outcome === "CANCEL"
        ? {
            status: "CANCELLED",
            result: null,
            terminationReason: "CANCELLED",
            endedAt: now,
            activeColor: null,
            clockStartedAt: null,
            drawOfferParticipantId: null,
            pendingUndoParticipantId: null,
            lastActivityAt: now,
          }
        : {
            status: "FINISHED",
            result: outcome === "WIN" ? "BLACK_WIN" : "DRAW",
            terminationReason: "NO_SHOW",
            endedAt: now,
            activeColor: null,
            clockStartedAt: null,
            drawOfferParticipantId: null,
            pendingUndoParticipantId: null,
            lastActivityAt: now,
          });

    if (!hasAffectedRows(finalGame)) return null;
    if (outcome === "CANCEL") return finalGame;

    const finalizedGame = await tx.orm.public.Game.where({ id: gameId }).first();
    if (
      finalizedGame &&
      (finalizedGame.status === "FINISHED" || finalizedGame.status === "CANCELLED")
    ) {
      notifications.push(...await finalizeGameFinishedEffects(tx, {
        id: finalizedGame.id,
        type: finalizedGame.type,
        status: finalizedGame.status,
        isRated: finalizedGame.isRated,
        ratingCategory: finalizedGame.ratingCategory,
        result: finalizedGame.result,
        tournamentRoundId: finalizedGame.tournamentRoundId,
      }, await tx.orm.public.GameParticipant.where({ gameId }).all()));
    }
    return finalGame;
  });
  publishGameFinishedNotifications(notifications);
  return finalGame;
}

export async function finishGameOnTimeout(
  gameId: number,
  expectedFen: string,
  activeColor: "WHITE" | "BLACK",
  whiteTimeRemainingMs: bigint,
  blackTimeRemainingMs: bigint,
) {
  const now = Temporal.Now.instant();
  const notifications: NotificationBroadcast[] = [];
  const updatedGame = await db.transaction(async (tx) => {
    const locked = await tx.orm.public.Game.where({ id: gameId })
      .update({ lastActivityAt: now });
    if (!hasAffectedRows(locked)) return null;
    const currentGame = await tx.orm.public.Game.where({ id: gameId }).first();
    if (
      !currentGame ||
      currentGame.status !== "IN_PROGRESS" ||
      currentGame.currentFen !== expectedFen ||
      currentGame.activeColor !== activeColor
    ) {
      return null;
    }

    const updatedGame = await tx.orm.public.Game
      .where({
        id: gameId,
        status: "IN_PROGRESS",
        currentFen: expectedFen,
        activeColor,
      })
      .update({
        status: "FINISHED",
        result: activeColor === "WHITE" ? "BLACK_WIN" : "WHITE_WIN",
        terminationReason: "TIMEOUT",
        whiteTimeRemainingMs,
        blackTimeRemainingMs,
        endedAt: now,
        activeColor: null,
        clockStartedAt: null,
        drawOfferParticipantId: null,
        pendingUndoParticipantId: null,
        lastActivityAt: now,
      });
    if (!hasAffectedRows(updatedGame)) return null;

    const finalizedGame = await tx.orm.public.Game.where({ id: gameId }).first();
    if (
      finalizedGame &&
      (finalizedGame.status === "FINISHED" || finalizedGame.status === "CANCELLED")
    ) {
      notifications.push(...await finalizeGameFinishedEffects(tx, {
        id: finalizedGame.id,
        type: finalizedGame.type,
        status: finalizedGame.status,
        isRated: finalizedGame.isRated,
        ratingCategory: finalizedGame.ratingCategory,
        result: finalizedGame.result,
        tournamentRoundId: finalizedGame.tournamentRoundId,
      }, await tx.orm.public.GameParticipant.where({ gameId }).all()));
    }
    return updatedGame;
  });
  publishGameFinishedNotifications(notifications);
  return updatedGame;
}

export async function createUndoRequest(
  gameId: number,
  expectedFen: string,
  participantId: number,
) {
  return db.orm.public.Game
    .where({
      id: gameId,
      type: "LOCAL",
      status: "IN_PROGRESS",
      currentFen: expectedFen,
      pendingUndoParticipantId: null,
    })
    .update({ pendingUndoParticipantId: participantId, lastActivityAt: Temporal.Now.instant() });
}

export async function clearUndoRequest(
  gameId: number,
  participantId: number,
  expectedFen: string,
) {
  return db.orm.public.Game
    .where({
      id: gameId,
      type: "LOCAL",
      status: "IN_PROGRESS",
      currentFen: expectedFen,
      pendingUndoParticipantId: participantId,
    })
    .update({ pendingUndoParticipantId: null, lastActivityAt: Temporal.Now.instant() });
}

export async function acceptUndoRequest(
  gameId: number,
  expectedFen: string,
  requestingParticipantId: number,
  previousFen: string,
  activeColor: "WHITE" | "BLACK",
  whiteTimeRemainingMs: bigint,
  blackTimeRemainingMs: bigint,
) {
  return db.transaction(async (tx) => {
    const recentMoves = await tx.orm.public.Move
      .where({ gameId })
      .orderBy((move) => move.ply.desc())
      .limit(2)
      .all();
    const latestMove = recentMoves[0];
    if (!latestMove) return null;

    const now = Temporal.Now.instant();
    const updatedGame = await tx.orm.public.Game
      .where({
        id: gameId,
        type: "LOCAL",
        status: "IN_PROGRESS",
        currentFen: expectedFen,
        pendingUndoParticipantId: requestingParticipantId,
      })
      .update({
        currentFen: previousFen,
        activeColor,
        status: "IN_PROGRESS",
        result: null,
        terminationReason: null,
        endedAt: null,
        clockStartedAt: now,
        whiteTimeRemainingMs,
        blackTimeRemainingMs,
        pendingUndoParticipantId: null,
        drawOfferParticipantId: null,
        lastMoveAt: recentMoves[1]?.playedAt ?? null,
        lastActivityAt: now,
      });
    if (!updatedGame) return null;

    await tx.orm.public.Move.where({ id: latestMove.id, gameId }).delete();
    return { game: updatedGame, move: latestMove };
  });
}
