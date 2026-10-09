import { db } from "../prisma/db.ts";

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

export async function appendMove(
  gameId: number,
  expectedFen: string,
  expectedStatus: "WAITING" | "IN_PROGRESS",
  expectedActiveColor: "WHITE" | "BLACK" | null,
  move: CreateMoveData,
  gameUpdates: Parameters<ReturnType<typeof db.orm.public.Game.where>["update"]>[0],
) {
  return db.transaction(async (tx) => {
    const updatedGame = await tx.orm.public.Game
      .where({
        id: gameId,
        currentFen: expectedFen,
        status: expectedStatus,
        activeColor: expectedActiveColor,
        pendingUndoParticipantId: null,
      })
      .update(gameUpdates);
    if (!updatedGame) {
      throw new MoveRepositoryConflict();
    }

    const createdMove = await tx.orm.public.Move.create(move);
    return { game: updatedGame, move: createdMove };
  });
}

export async function updateMove(id: number, updates: UpdateMoveData) {
  return db.orm.public.Move.where({ id }).update(updates);
}

export async function deleteMove(id: number) {
  return db.orm.public.Move.where({ id }).delete();
}
