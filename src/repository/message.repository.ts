import { db } from "../prisma/db.ts";
import { not } from "@prisma/orm-postgres/orm-client";
import { toTemporal } from "../utils/temporalDate.ts";

type CreateMessageData = Parameters<typeof db.orm.public.Message.create>[0];
type UpdateMessageData = Parameters<ReturnType<typeof db.orm.public.Message.where>["update"]>[0];

export async function findMessage(id: number) {
  return db.orm.public.Message.where({ id }).first();
}

export async function findMessages(limit = 100) {
  return db.orm.public.Message.limit(limit).all();
}

export async function createMessage(data: CreateMessageData) {
  return db.orm.public.Message.create(data);
}

export async function updateMessage(id: number, updates: UpdateMessageData) {
  return db.orm.public.Message.where({ id }).update(updates);
}

export async function deleteMessage(id: number) {
  return db.orm.public.Message.where({ id }).delete();
}

export async function findMessagesForConversation(
  conversationId: number,
  limit: number,
  beforeId?: number,
) {
  let query = db.orm.public.Message
    .where({ conversationId, deletedAt: null })
    .orderBy((message) => message.id.desc());
  if (beforeId !== undefined) query = query.cursor({ id: beforeId });
  const messages = await query.limit(limit).all();
  return messages.reverse();
}

export async function countUnreadMessages(
  conversationId: number,
  userId: number,
  lastReadAt: Date | null,
) {
  const conversation = await db.orm.public.Conversation
    .where({ id: conversationId })
    .include("messages", (messages) => {
      let unreadMessages = messages
        .where({ deletedAt: null })
        .where((message) => not(message.senderId.eq(userId)));
      if (lastReadAt) {
        unreadMessages = unreadMessages.where((message) =>
          message.createdAt.gt(toTemporal(lastReadAt))
        );
      }
      return unreadMessages.count();
    })
    .first();
  if (!conversation) {
    throw new Error(`Conversation ${conversationId} introuvable lors du comptage des messages non lus.`);
  }
  return conversation.messages;
}
