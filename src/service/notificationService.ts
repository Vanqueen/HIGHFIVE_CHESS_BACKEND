import { publishNotification } from "../events/notification.broadcast";
import type { NotificationBroadcast } from "../events/notification.broadcast";
import { db } from "../prisma/db.ts";
import { createNotification, findNotificationsForUser } from "../repository/notification.repository";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

type NotificationType =
  | "CHALLENGE_RECEIVED"
  | "CHALLENGE_ACCEPTED"
  | "GAME_STARTED"
  | "GAME_FINISHED"
  | "GAME_YOUR_TURN"
  | "SYSTEM";

export class NotificationService {
  static createInTransaction(
    tx: Transaction,
    userId: number,
    type: NotificationType,
    title: string,
    content: string,
    data: Record<string, number | string>,
  ) {
    return tx.orm.public.Notification.create({
      userId,
      type,
      title,
      content,
      data,
    });
  }

  static publish(notification: NotificationBroadcast) {
    publishNotification(notification);
  }

  static async create(
    userId: number,
    type: NotificationType,
    title: string,
    content: string,
    data: Record<string, number | string>,
  ) {
    const notification = await createNotification({
      userId,
      type,
      title,
      content,
      data,
    });
    this.publish(notification);
    return notification;
  }

  static async notifyChallengeReceived(
    userId: number,
    challengeId: number,
    gameId: number,
    creatorUsername: string,
  ) {
    return this.create(
      userId,
      "CHALLENGE_RECEIVED",
      "Nouveau défi",
      `${creatorUsername} vous a défié aux échecs.`,
      { challengeId, gameId },
    );
  }

  static async notifyChallengeAccepted(
    userId: number,
    challengeId: number,
    gameId: number,
    playerName: string,
  ) {
    return this.create(
      userId,
      "CHALLENGE_ACCEPTED",
      "Défi accepté",
      `${playerName} a accepté votre défi.`,
      { challengeId, gameId },
    );
  }

  static async notifyChallengeClosed(
    userId: number,
    challengeId: number,
    gameId: number,
    action: "declined" | "cancelled" | "expired",
  ) {
    const content = {
      declined: "Le joueur invité a refusé votre défi.",
      cancelled: "Le défi a été annulé.",
      expired: "Le défi a expiré.",
    }[action];
    return this.create(
      userId,
      "SYSTEM",
      "Mise à jour du défi",
      content,
      { challengeId, gameId, action },
    );
  }

  static async getForUser(userId: number, limit = 50) {
    return findNotificationsForUser(userId, limit);
  }
}
