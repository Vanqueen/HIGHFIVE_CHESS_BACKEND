import { db } from "../prisma/db.ts";

type CreateMoveData = Parameters<typeof db.orm.public.Move.create>[0];
type UpdateMoveData = Parameters<ReturnType<typeof db.orm.public.Move.where>["update"]>[0];

export async function findMove(id: number) {
  return db.orm.public.Move.where({ id }).first();
}

export async function findMoves(limit = 100) {
  return db.orm.public.Move.limit(limit).all();
}

export async function createMove(data: CreateMoveData) {
  return db.orm.public.Move.create(data);
}

export async function updateMove(id: number, updates: UpdateMoveData) {
  return db.orm.public.Move.where({ id }).update(updates);
}

export async function deleteMove(id: number) {
  return db.orm.public.Move.where({ id }).delete();
}
