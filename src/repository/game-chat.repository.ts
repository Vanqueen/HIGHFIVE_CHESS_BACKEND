import { db } from "../prisma/db.ts";
import { toTemporal } from "../utils/temporalDate.ts";

export async function findOrCreateGameConversation(gameId: number, userIds: number[]) {
  return db.transaction(async (tx) => {
    const game = await tx.orm.public.Game.where({ id: gameId }).first();
    if (!game) return null;

    let conversation = await tx.orm.public.Conversation.where({ gameId }).first();
    if (!conversation) {
      conversation = await tx.orm.public.Conversation.create({
        gameId,
        type: "GAME",
        createdAt: toTemporal(new Date()),
      });
    }

    const participants = await tx.orm.public.ConversationParticipant
      .where({ conversationId: conversation.id })
      .all();
    const currentUserIds = new Set(participants.map((participant) => participant.userId));
    for (const userId of new Set(userIds)) {
      if (currentUserIds.has(userId)) continue;
      await tx.orm.public.ConversationParticipant.create({
        conversationId: conversation.id,
        userId,
        joinedAt: toTemporal(new Date()),
      });
    }
    return conversation;
  });
}

export async function createGameMessage(
  gameId: number,
  senderId: number,
  content: string,
) {
  return db.transaction(async (tx) => {
    const gameParticipant = await tx.orm.public.GameParticipant
      .where({ gameId, userId: senderId })
      .first();
    if (!gameParticipant) return null;

    const gameParticipants = await tx.orm.public.GameParticipant.where({ gameId }).all();
    const userIds = gameParticipants
      .map((participant) => participant.userId)
      .filter((userId): userId is number => userId !== null);

    const game = await tx.orm.public.Game.where({ id: gameId }).first();
    if (!game) return null;

    let conversation = await tx.orm.public.Conversation.where({ gameId }).first();
    if (!conversation) {
      conversation = await tx.orm.public.Conversation.create({
        gameId,
        type: "GAME",
        createdAt: toTemporal(new Date()),
      });
    }

    const knownParticipants = await tx.orm.public.ConversationParticipant
      .where({ conversationId: conversation.id })
      .all();
    const knownUserIds = new Set(knownParticipants.map((participant) => participant.userId));
    for (const userId of new Set(userIds)) {
      if (knownUserIds.has(userId)) continue;
      await tx.orm.public.ConversationParticipant.create({
        conversationId: conversation.id,
        userId,
        joinedAt: toTemporal(new Date()),
      });
    }

    return tx.orm.public.Message.create({
      conversationId: conversation.id,
      senderId,
      content,
      messageType: "TEXT",
      createdAt: toTemporal(new Date()),
    });
  });
}

export async function findGameMessages(gameId: number, limit = 50) {
  const conversation = await db.orm.public.Conversation.where({ gameId }).first();
  if (!conversation) return [];
  const messages = await db.orm.public.Message
    .where({ conversationId: conversation.id, deletedAt: null })
    .orderBy((message) => message.createdAt.desc())
    .limit(limit)
    .all();
  return messages.reverse();
}
