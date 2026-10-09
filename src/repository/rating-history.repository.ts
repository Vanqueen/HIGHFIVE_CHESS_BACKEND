import { db } from "../prisma/db.ts";

type CreateRatingHistoryData = Parameters<typeof db.orm.public.RatingHistory.create>[0];
type UpdateRatingHistoryData = Parameters<
  ReturnType<typeof db.orm.public.RatingHistory.where>["update"]
>[0];

export async function findRatingHistory(id: number) {
  return db.orm.public.RatingHistory.where({ id }).first();
}

export async function findRatingHistories(limit = 100) {
  return db.orm.public.RatingHistory.limit(limit).all();
}

export async function createRatingHistory(data: CreateRatingHistoryData) {
  return db.orm.public.RatingHistory.create(data);
}

export async function updateRatingHistory(id: number, updates: UpdateRatingHistoryData) {
  return db.orm.public.RatingHistory.where({ id }).update(updates);
}

export async function deleteRatingHistory(id: number) {
  return db.orm.public.RatingHistory.where({ id }).delete();
}
