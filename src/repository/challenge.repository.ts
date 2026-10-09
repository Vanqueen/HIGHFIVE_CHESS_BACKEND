import { db } from "../prisma/db.ts";

type CreateChallengeData = Parameters<typeof db.orm.public.Challenge.create>[0];
type UpdateChallengeData = Parameters<
  ReturnType<typeof db.orm.public.Challenge.where>["update"]
>[0];

export async function findChallenge(id: number) {
  return db.orm.public.Challenge.where({ id }).first();
}

export async function findChallenges(limit = 100) {
  return db.orm.public.Challenge.limit(limit).all();
}

export async function createChallenge(data: CreateChallengeData) {
  return db.orm.public.Challenge.create(data);
}

export async function updateChallenge(id: number, updates: UpdateChallengeData) {
  return db.orm.public.Challenge.where({ id }).update(updates);
}

export async function deleteChallenge(id: number) {
  return db.orm.public.Challenge.where({ id }).delete();
}
