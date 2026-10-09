import { db } from "../prisma/db.ts";

type CreateGameData = Parameters<typeof db.orm.public.Game.create>[0];
type UpdateGameData = Parameters<ReturnType<typeof db.orm.public.Game.where>["update"]>[0];

export async function findGame(id: number) {
  return db.orm.public.Game.where({ id }).first();
}

export async function findGames(limit = 100) {
  return db.orm.public.Game.limit(limit).all();
}

export async function createGame(data: CreateGameData) {
  return db.orm.public.Game.create(data);
}

export async function updateGame(id: number, updates: UpdateGameData) {
  return db.orm.public.Game.where({ id }).update(updates);
}

export async function deleteGame(id: number) {
  return db.orm.public.Game.where({ id }).delete();
}
