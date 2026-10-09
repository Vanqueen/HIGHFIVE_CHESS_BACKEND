import { db } from "../prisma/db.ts";

export async function startGameClock(gameId: number) {
  const now = new Date();
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
  const now = new Date();
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
  const now = new Date();
  return db.orm.public.Game
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
}

export async function finishGame(
  gameId: number,
  updates: {
    result: "WHITE_WIN" | "BLACK_WIN" | "DRAW";
    terminationReason: "RESIGNATION" | "TIMEOUT";
    activeColor?: "WHITE" | "BLACK" | null;
    clockStartedAt?: Date | null;
    whiteTimeRemainingMs?: bigint;
    blackTimeRemainingMs?: bigint;
  },
) {
  const now = new Date();
  return db.orm.public.Game
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
}

export async function finishGameOnTimeout(
  gameId: number,
  expectedFen: string,
  activeColor: "WHITE" | "BLACK",
  whiteTimeRemainingMs: bigint,
  blackTimeRemainingMs: bigint,
) {
  const now = new Date();
  return db.orm.public.Game
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
    .update({ pendingUndoParticipantId: participantId, lastActivityAt: new Date() });
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
    .update({ pendingUndoParticipantId: null, lastActivityAt: new Date() });
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

    const now = new Date();
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
