import { db } from "../prisma/db.ts";
import type { NotificationBroadcast } from "../events/notification.broadcast";

type CreateNotificationData = Parameters<typeof db.orm.public.Notification.create>[0];
type UpdateNotificationData = Parameters<
  ReturnType<typeof db.orm.public.Notification.where>["update"]
>[0];
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type NotificationType = CreateNotificationData["type"];
type NotificationRecipient =
  | { userId: number; guestParticipantId?: never }
  | { userId?: never; guestParticipantId: number };

export async function findNotification(id: number) {
  return db.orm.public.Notification.where({ id }).first();
}

export async function findNotifications(limit = 100) {
  return db.orm.public.Notification.limit(limit).all();
}

export async function createNotification(data: CreateNotificationData) {
  return db.orm.public.Notification.create(data);
}

export async function createNotificationInTransaction(
  tx: Transaction,
  recipient: NotificationRecipient,
  type: NotificationType,
  title: string,
  content: string,
  data: Record<string, number | string>,
) {
  if (recipient.userId !== undefined) {
    const notification = await tx.orm.public.Notification.create({
      userId: recipient.userId,
      type,
      title,
      content,
      data,
    });
    return { ...notification, guestParticipantId: null } satisfies NotificationBroadcast;
  }

  const notification = await tx.orm.public.GuestNotification.create({
    guestParticipantId: recipient.guestParticipantId,
    type,
    title,
    content,
    data,
  });
  return {
    ...notification,
    userId: null,
  } satisfies NotificationBroadcast;
}

export async function findNotificationsForUser(userId: number, limit = 50) {
  return db.orm.public.Notification.where({ userId })
    .orderBy((notification) => notification.createdAt.desc())
    .limit(limit)
    .all();
}

export async function findNotificationsForGuest(guestParticipantId: number, limit = 50) {
  return db.orm.public.GuestNotification.where({ guestParticipantId })
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
