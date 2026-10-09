import { db } from "../prisma/db.ts";

type CreateConversationParticipantData = Parameters<
  typeof db.orm.public.ConversationParticipant.create
>[0];
type UpdateConversationParticipantData = Parameters<
  ReturnType<typeof db.orm.public.ConversationParticipant.where>["update"]
>[0];

export async function findConversationParticipant(id: number) {
  return db.orm.public.ConversationParticipant.where({ id }).first();
}

export async function findConversationParticipants(limit = 100) {
  return db.orm.public.ConversationParticipant.limit(limit).all();
}

export async function createConversationParticipant(data: CreateConversationParticipantData) {
  return db.orm.public.ConversationParticipant.create(data);
}

export async function updateConversationParticipant(
  id: number,
  updates: UpdateConversationParticipantData,
) {
  return db.orm.public.ConversationParticipant.where({ id }).update(updates);
}

export async function deleteConversationParticipant(id: number) {
  return db.orm.public.ConversationParticipant.where({ id }).delete();
}
