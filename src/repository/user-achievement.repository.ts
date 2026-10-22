import { db } from "../prisma/db.ts";

type CreateUserAchievementData = Parameters<typeof db.orm.public.UserAchievement.create>[0];
type UpdateUserAchievementData = Parameters<
  ReturnType<typeof db.orm.public.UserAchievement.where>["update"]
>[0];

export async function findUserAchievement(id: number) {
  return db.orm.public.UserAchievement.where({ id }).first();
}

export async function findUserAchievements(limit = 100) {
  return db.orm.public.UserAchievement.limit(limit).all();
}

export async function createUserAchievement(data: CreateUserAchievementData) {
  return db.orm.public.UserAchievement.create(data);
}

export async function updateUserAchievement(id: number, updates: UpdateUserAchievementData) {
  return db.orm.public.UserAchievement.where({ id }).update(updates);
}

export async function deleteUserAchievement(id: number) {
  return db.orm.public.UserAchievement.where({ id }).delete();
}
