import { db } from "../prisma/db.ts";
import { epochMilliseconds, toTemporal } from "../utils/temporalDate.ts";

type CreateConversationData = Parameters<typeof db.orm.public.Conversation.create>[0];
type UpdateConversationData = Parameters<
  ReturnType<typeof db.orm.public.Conversation.where>["update"]
>[0];

export async function findConversation(id: number) {
  return db.orm.public.Conversation.where({ id }).first();
}

export async function findConversations(limit = 100) {
  return db.orm.public.Conversation.limit(limit).all();
}

export async function createConversation(data: CreateConversationData) {
  return db.orm.public.Conversation.create(data);
}

export async function updateConversation(id: number, updates: UpdateConversationData) {
  return db.orm.public.Conversation.where({ id }).update(updates);
}

export async function deleteConversation(id: number) {
  return db.orm.public.Conversation.where({ id }).delete();
}

async function findDirectConversationInTransaction(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  firstUserId: number,
  secondUserId: number,
) {
  const firstMemberships = await tx.orm.public.ConversationParticipant
    .where({ userId: firstUserId, leftAt: null })
    .all();
  for (const membership of firstMemberships) {
    const conversation = await tx.orm.public.Conversation
      .where({ id: membership.conversationId, type: "DIRECT" })
      .first();
    if (!conversation) continue;
    const participants = await tx.orm.public.ConversationParticipant
      .where({ conversationId: conversation.id, leftAt: null })
      .all();
    if (
      participants.length === 2 &&
      participants.some((participant) => participant.userId === firstUserId) &&
      participants.some((participant) => participant.userId === secondUserId)
    ) return conversation;
  }
  return null;
}

export async function createOrFindDirectConversation(firstUserId: number, secondUserId: number) {
  return db.transaction(async (tx) => {
    const [firstBlocksSecond, secondBlocksFirst] = await Promise.all([
      tx.orm.public.BlockedUser
        .where({ blockerId: firstUserId, blockedUserId: secondUserId })
        .first(),
      tx.orm.public.BlockedUser
        .where({ blockerId: secondUserId, blockedUserId: firstUserId })
        .first(),
    ]);
    if (firstBlocksSecond || secondBlocksFirst) {
      throw Object.assign(new Error("Cette interaction n’est pas autorisée."), {
        statusCode: 403,
      });
    }

    const existing = await findDirectConversationInTransaction(tx, firstUserId, secondUserId);
    if (existing) return existing;
    const conversation = await tx.orm.public.Conversation.create({
      type: "DIRECT",
      gameId: null,
      createdAt: toTemporal(new Date()),
    });
    await tx.orm.public.ConversationParticipant.create({
      conversationId: conversation.id,
      userId: firstUserId,
      joinedAt: toTemporal(new Date()),
    });
    await tx.orm.public.ConversationParticipant.create({
      conversationId: conversation.id,
      userId: secondUserId,
      joinedAt: toTemporal(new Date()),
    });
    return conversation;
  });
}

type ConversationParticipant = Awaited<
  ReturnType<typeof db.orm.public.ConversationParticipant.all>
>[number];

export async function findConversationParticipant(conversationId: number, userId: number) {
  return db.orm.public.ConversationParticipant
    .where({ conversationId, userId })
    .first();
}

export async function findConversationParticipants(conversationId: number) {
  return db.orm.public.ConversationParticipant
    .where({ conversationId, leftAt: null })
    .all();
}

export async function findDirectConversationsForUser(userId: number) {
  const memberships = await db.orm.public.ConversationParticipant
    .where({ userId, leftAt: null })
    .all();
  const conversations = [];
  for (const membership of memberships) {
    const conversation = await db.orm.public.Conversation
      .where({ id: membership.conversationId, type: "DIRECT" })
      .first();
    if (!conversation) continue;
    const participants = await db.orm.public.ConversationParticipant
      .where({ conversationId: conversation.id, leftAt: null })
      .all();
    if (participants.length !== 2) continue;
    const other = participants.find((participant) => participant.userId !== userId);
    if (other) conversations.push({ conversation, otherUserId: other.userId });
  }
  return conversations.sort(
    (left, right) =>
      epochMilliseconds(right.conversation.updatedAt) -
      epochMilliseconds(left.conversation.updatedAt),
  );
}
