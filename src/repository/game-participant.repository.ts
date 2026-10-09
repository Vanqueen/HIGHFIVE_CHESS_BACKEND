import { db } from "../prisma/db.ts";

type CreateGameParticipantData = Parameters<typeof db.orm.public.GameParticipant.create>[0];
type UpdateGameParticipantData = Parameters<
  ReturnType<typeof db.orm.public.GameParticipant.where>["update"]
>[0];

export async function findGameParticipant(id: number) {
  return db.orm.public.GameParticipant.where({ id }).first();
}

export async function findGameParticipants(limit = 100) {
  return db.orm.public.GameParticipant.limit(limit).all();
}

export async function createGameParticipant(data: CreateGameParticipantData) {
  return db.orm.public.GameParticipant.create(data);
}

export async function updateGameParticipant(id: number, updates: UpdateGameParticipantData) {
  return db.orm.public.GameParticipant.where({ id }).update(updates);
}

export async function deleteGameParticipant(id: number) {
  return db.orm.public.GameParticipant.where({ id }).delete();
}
