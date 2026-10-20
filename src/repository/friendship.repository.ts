import { db } from "../prisma/db.ts";
import { createNotificationInTransaction } from "./notification.repository";
import { epochMilliseconds, toTemporal } from "../utils/temporalDate.ts";

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

export async function findFriendshipsForUser(userId: number) {
  const [sent, received] = await Promise.all([
    db.orm.public.Friendship.where({ requesterId: userId }).all(),
    db.orm.public.Friendship.where({ addresseeId: userId }).all(),
  ]);
  return [...sent, ...received].sort(
    (left, right) => epochMilliseconds(right.createdAt) - epochMilliseconds(left.createdAt),
  );
}

export async function createOrUpdateFriendshipRequest(
  requesterId: number,
  addresseeId: number,
  requesterUsername: string,
) {
  return db.transaction(async (tx) => {
    const [requesterBlocked, addresseeBlocked] = await Promise.all([
      tx.orm.public.BlockedUser.where({
        blockerId: requesterId,
        blockedUserId: addresseeId,
      }).first(),
      tx.orm.public.BlockedUser.where({
        blockerId: addresseeId,
        blockedUserId: requesterId,
      }).first(),
    ]);
    if (requesterBlocked || addresseeBlocked) {
      throw Object.assign(new Error("Cette interaction n’est pas autorisée."), {
        statusCode: 403,
      });
    }

    const forward = await tx.orm.public.Friendship
      .where({ requesterId, addresseeId })
      .first();
    const reverse = await tx.orm.public.Friendship
      .where({ requesterId: addresseeId, addresseeId: requesterId })
      .first();

    if (forward?.status === "PENDING" || forward?.status === "ACCEPTED") {
      return { friendship: forward, notifications: [], kind: "existing" as const };
    }
    if (reverse?.status === "ACCEPTED") {
      return { friendship: reverse, notifications: [], kind: "existing" as const };
    }
    if (reverse?.status === "PENDING") {
      const friendship = await tx.orm.public.Friendship
        .where({ id: reverse.id, status: "PENDING" })
        .update({ status: "ACCEPTED", respondedAt: toTemporal(new Date()) });
      if (!friendship) return { friendship: null, notifications: [], kind: "raced" as const };
      const notification = await createNotificationInTransaction(
        tx,
        { userId: reverse.requesterId },
        "FRIEND_REQUEST_ACCEPTED",
        "Demande d’amitié acceptée",
        `${requesterUsername} a accepté votre demande d’amitié.`,
        { friendshipId: friendship.id },
      );
      return { friendship, notifications: [notification], kind: "accepted" as const };
    }

    if (forward) await tx.orm.public.Friendship.where({ id: forward.id }).delete();
    if (reverse) await tx.orm.public.Friendship.where({ id: reverse.id }).delete();

    const friendship = await tx.orm.public.Friendship.create({
      requesterId,
      addresseeId,
      status: "PENDING",
      respondedAt: null,
      createdAt: toTemporal(new Date()),
    });
    const notification = await createNotificationInTransaction(
      tx,
      { userId: addresseeId },
      "FRIEND_REQUEST",
      "Nouvelle demande d’amitié",
      `${requesterUsername} vous a envoyé une demande d’amitié.`,
      { friendshipId: friendship.id },
    );
    return { friendship, notifications: [notification], kind: "created" as const };
  });
}

export async function acceptFriendshipRequest(friendshipId: number, addresseeId: number) {
  return db.transaction(async (tx) => {
    const pending = await tx.orm.public.Friendship
      .where({ id: friendshipId, addresseeId, status: "PENDING" })
      .first();
    if (!pending) return null;
    const [requesterBlocked, addresseeBlocked] = await Promise.all([
      tx.orm.public.BlockedUser.where({
        blockerId: pending.requesterId,
        blockedUserId: pending.addresseeId,
      }).first(),
      tx.orm.public.BlockedUser.where({
        blockerId: pending.addresseeId,
        blockedUserId: pending.requesterId,
      }).first(),
    ]);
    if (requesterBlocked || addresseeBlocked) return null;
    const friendship = await tx.orm.public.Friendship
      .where({ id: friendshipId, addresseeId, status: "PENDING" })
      .update({ status: "ACCEPTED", respondedAt: toTemporal(new Date()) });
    if (!friendship) return null;

    const notification = await createNotificationInTransaction(
      tx,
      { userId: pending.requesterId },
      "FRIEND_REQUEST_ACCEPTED",
      "Demande d’amitié acceptée",
      "Votre demande d’amitié a été acceptée.",
      { friendshipId },
    );
    return { friendship, notifications: [notification] };
  });
}

export async function rejectFriendshipRequest(friendshipId: number, addresseeId: number) {
  return db.orm.public.Friendship
    .where({ id: friendshipId, addresseeId, status: "PENDING" })
    .update({ status: "REJECTED", respondedAt: toTemporal(new Date()) });
}

export async function removeFriendshipBetweenUsers(
  friendshipId: number,
  firstUserId: number,
  secondUserId: number,
) {
  return db.orm.public.Friendship.where({
    id: friendshipId,
    requesterId: firstUserId,
    addresseeId: secondUserId,
  }).delete();
}
