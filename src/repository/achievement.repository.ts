import { db } from "../prisma/db.ts";

type CreateAchievementData = Parameters<typeof db.orm.public.Achievement.create>[0];
type UpdateAchievementData = Parameters<
  ReturnType<typeof db.orm.public.Achievement.where>["update"]
>[0];

export async function findAchievement(id: number) {
  return db.orm.public.Achievement.where({ id }).first();
}

export async function findAchievements(limit = 100) {
  return db.orm.public.Achievement.limit(limit).all();
}

export async function createAchievement(data: CreateAchievementData) {
  return db.orm.public.Achievement.create(data);
}

export async function updateAchievement(id: number, updates: UpdateAchievementData) {
  return db.orm.public.Achievement.where({ id }).update(updates);
}

export async function deleteAchievement(id: number) {
  return db.orm.public.Achievement.where({ id }).delete();
}
