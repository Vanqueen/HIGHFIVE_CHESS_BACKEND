import { db } from "../prisma/db.ts";
import type { NotificationBroadcast } from "../events/notification.broadcast";
import {
  finalizeGameFinishedEffects,
  publishGameFinishedNotifications,
} from "../service/gameFinishedEffects";
import { hasAffectedRows } from "./affected-rows";

export type CreateMoveData = Parameters<typeof db.orm.public.Move.create>[0];
type UpdateMoveData = Parameters<ReturnType<typeof db.orm.public.Move.where>["update"]>[0];

export async function findMove(id: number) {
  return db.orm.public.Move.where({ id }).first();
}

export async function findMoves(limit = 100) {
  return db.orm.public.Move.limit(limit).all();
}

export async function findMovesByGameId(gameId: number) {
  return db.orm.public.Move.where({ gameId }).orderBy((move) => move.ply.asc()).all();
}

export async function findMovesMissingFenBefore() {
  return db.orm.public.Move.where({ fenBefore: null }).all();
}

export async function findMoveByGameAndPly(gameId: number, ply: number) {
  return db.orm.public.Move.where({ gameId, ply }).first();
}

export async function createMove(data: CreateMoveData) {
  return db.orm.public.Move.create(data);
}

export class MoveRepositoryConflict extends Error {
  readonly statusCode = 409;

  constructor() {
    super("La partie a changé. Rechargez son état avant de jouer.");
    this.name = "MoveRepositoryConflict";
  }
}

function isDuplicateMovePlyError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const databaseError = error as {
    code?: unknown;
    constraint?: unknown;
    message?: unknown;
    meta?: { target?: unknown };
  };
  const isMovePlyTarget = Array.isArray(databaseError.meta?.target) &&
    databaseError.meta.target.includes("gameId") &&
    databaseError.meta.target.includes("ply");
  return (
    (databaseError.code === "23505" &&
      databaseError.constraint === "Move_gameId_ply_key") ||
    (databaseError.code === "P2002" && isMovePlyTarget) ||
    (typeof databaseError.message === "string" &&
      databaseError.message.includes("Move_gameId_ply_key"))
  );
}

export async function appendMove(
  gameId: number,
  expectedFen: string,
  expectedStatus: "WAITING" | "IN_PROGRESS",
  expectedActiveColor: "WHITE" | "BLACK" | null,
  move: Omit<CreateMoveData, "ply">,
  gameUpdates: Parameters<ReturnType<typeof db.orm.public.Game.where>["update"]>[0],
) {
  const notifications: NotificationBroadcast[] = [];
  try {
    const result = await db.transaction(async (tx) => {
      const updatedGame = await tx.orm.public.Game
        .where({
          id: gameId,
          currentFen: expectedFen,
          status: expectedStatus,
          activeColor: expectedActiveColor,
          pendingUndoParticipantId: null,
        })
        .update(gameUpdates);
      if (!hasAffectedRows(updatedGame) || !updatedGame) {
        throw new MoveRepositoryConflict();
      }

      const lastMove = await tx.orm.public.Move
        .where({ gameId })
        .orderBy((row) => row.ply.desc())
        .first();
      const createdMove = await tx.orm.public.Move.create({
        ...move,
        ply: (lastMove?.ply ?? 0) + 1,
      });

      if (updatedGame?.status === "FINISHED") {
        const finalizedGame = await tx.orm.public.Game.where({ id: gameId }).first();
        if (finalizedGame && finalizedGame.status === "FINISHED") {
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
      }

      return { game: updatedGame, move: createdMove };
    });
    publishGameFinishedNotifications(notifications);
    return result;
  } catch (error) {
    if (isDuplicateMovePlyError(error)) throw new MoveRepositoryConflict();
    throw error;
  }
}

export async function updateMove(id: number, updates: UpdateMoveData) {
  return db.orm.public.Move.where({ id }).update(updates);
}

export async function backfillMoveFenBefore(id: number, fenBefore: string) {
  return db.orm.public.Move.where({ id, fenBefore: null }).update({ fenBefore });
}

export async function deleteMove(id: number) {
  return db.orm.public.Move.where({ id }).delete();
}
