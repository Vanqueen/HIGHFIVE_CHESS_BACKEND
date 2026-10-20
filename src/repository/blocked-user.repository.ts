import { db } from "../prisma/db.ts";
import { toTemporal } from "../utils/temporalDate.ts";

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

export async function areUsersBlocked(firstUserId: number, secondUserId: number) {
  const [firstBlocksSecond, secondBlocksFirst] = await Promise.all([
    db.orm.public.BlockedUser
      .where({ blockerId: firstUserId, blockedUserId: secondUserId })
      .first(),
    db.orm.public.BlockedUser
      .where({ blockerId: secondUserId, blockedUserId: firstUserId })
      .first(),
  ]);
  return Boolean(firstBlocksSecond || secondBlocksFirst);
}

export async function findBlocksByUser(blockerId: number) {
  return db.orm.public.BlockedUser.where({ blockerId })
    .orderBy((blockedUser) => blockedUser.createdAt.desc())
    .all();
}

export async function createBlockAndRemoveFriendships(blockerId: number, blockedUserId: number) {
  return db.transaction(async (tx) => {
    const existing = await tx.orm.public.BlockedUser
      .where({ blockerId, blockedUserId })
      .first();
    if (existing) {
      throw Object.assign(new Error("Cet utilisateur est déjà bloqué."), {
        statusCode: 409,
      });
    }
    const block = await tx.orm.public.BlockedUser.create({
      blockerId,
      blockedUserId,
      createdAt: toTemporal(new Date()),
    });
    await tx.orm.public.Friendship
      .where({ requesterId: blockerId, addresseeId: blockedUserId })
      .delete();
    await tx.orm.public.Friendship
      .where({ requesterId: blockedUserId, addresseeId: blockerId })
      .delete();
    return block;
  });
}

export async function deleteBlock(blockerId: number, blockedUserId: number) {
  return db.orm.public.BlockedUser.where({ blockerId, blockedUserId }).delete();
}
