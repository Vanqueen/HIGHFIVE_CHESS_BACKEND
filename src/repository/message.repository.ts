import { db } from "../prisma/db.ts";

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
