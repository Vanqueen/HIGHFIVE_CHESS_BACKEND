import { db } from "../prisma/db.ts";

type CreateFriendshipData = Parameters<typeof db.orm.public.Friendship.create>[0];
type UpdateFriendshipData = Parameters<
  ReturnType<typeof db.orm.public.Friendship.where>["update"]
>[0];

export async function findFriendship(id: number) {
  return db.orm.public.Friendship.where({ id }).first();
}

export async function findFriendships(limit = 100) {
  return db.orm.public.Friendship.limit(limit).all();
}

export async function createFriendship(data: CreateFriendshipData) {
  return db.orm.public.Friendship.create(data);
}

export async function updateFriendship(id: number, updates: UpdateFriendshipData) {
  return db.orm.public.Friendship.where({ id }).update(updates);
}

export async function deleteFriendship(id: number) {
  return db.orm.public.Friendship.where({ id }).delete();
}
