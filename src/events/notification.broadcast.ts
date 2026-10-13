import { EventEmitter } from "node:events";

export interface NotificationBroadcast {
  id: number;
  userId: number | null;
  guestParticipantId: number | null;
  type: string;
  title: string;
  content: string;
  data: unknown;
  createdAt: Date;
}

const notifications = new EventEmitter();

export function publishNotification(notification: NotificationBroadcast) {
  notifications.emit("notification", notification);
}

export function subscribeToNotifications(listener: (notification: NotificationBroadcast) => void) {
  notifications.on("notification", listener);
  return () => {
    notifications.off("notification", listener);
  };
}
