import { db } from "../prisma/db.ts";

type CreateBlockedUserData = Parameters<typeof db.orm.public.BlockedUser.create>[0];
type UpdateBlockedUserData = Parameters<
  ReturnType<typeof db.orm.public.BlockedUser.where>["update"]
>[0];

export async function findBlockedUser(id: number) {
  return db.orm.public.BlockedUser.where({ id }).first();
}

export async function findBlockedUsers(limit = 100) {
  return db.orm.public.BlockedUser.limit(limit).all();
}

export async function createBlockedUser(data: CreateBlockedUserData) {
  return db.orm.public.BlockedUser.create(data);
}

export async function updateBlockedUser(id: number, updates: UpdateBlockedUserData) {
  return db.orm.public.BlockedUser.where({ id }).update(updates);
}

export async function deleteBlockedUser(id: number) {
  return db.orm.public.BlockedUser.where({ id }).delete();
}
