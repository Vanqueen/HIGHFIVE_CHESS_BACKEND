import { db } from "../prisma/db.ts";

type CreateRatingData = Parameters<typeof db.orm.public.Rating.create>[0];
type UpdateRatingData = Parameters<ReturnType<typeof db.orm.public.Rating.where>["update"]>[0];

export async function findRating(id: number) {
  return db.orm.public.Rating.where({ id }).first();
}

export async function findRatings(limit = 100) {
  return db.orm.public.Rating.limit(limit).all();
}

export async function findRatingsByUserId(userId: number) {
  return db.orm.public.Rating.where({ userId }).all();
}

export async function createRating(data: CreateRatingData) {
  return db.orm.public.Rating.create(data);
}

export async function updateRating(id: number, updates: UpdateRatingData) {
  return db.orm.public.Rating.where({ id }).update(updates);
}

export async function deleteRating(id: number) {
  return db.orm.public.Rating.where({ id }).delete();
}
