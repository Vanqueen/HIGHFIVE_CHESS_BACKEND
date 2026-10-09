import { db } from "../prisma/db.ts";

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
