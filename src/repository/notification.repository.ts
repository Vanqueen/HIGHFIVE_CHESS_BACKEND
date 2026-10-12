import { db } from "../prisma/db.ts";

type CreateNotificationData = Parameters<typeof db.orm.public.Notification.create>[0];
type UpdateNotificationData = Parameters<
  ReturnType<typeof db.orm.public.Notification.where>["update"]
>[0];

export async function findNotification(id: number) {
  return db.orm.public.Notification.where({ id }).first();
}

export async function findNotifications(limit = 100) {
  return db.orm.public.Notification.limit(limit).all();
}

export async function createNotification(data: CreateNotificationData) {
  return db.orm.public.Notification.create(data);
}

export async function findNotificationsForUser(userId: number, limit = 50) {
  return db.orm.public.Notification.where({ userId })
    .orderBy((notification) => notification.createdAt.desc())
    .limit(limit)
    .all();
}

export async function updateNotification(id: number, updates: UpdateNotificationData) {
  return db.orm.public.Notification.where({ id }).update(updates);
}

export async function deleteNotification(id: number) {
  return db.orm.public.Notification.where({ id }).delete();
}
