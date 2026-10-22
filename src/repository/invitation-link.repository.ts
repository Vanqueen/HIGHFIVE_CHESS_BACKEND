import { db } from "../prisma/db.ts";
import { createNotificationInTransaction } from "./notification.repository";
import { toTemporal } from "../utils/temporalDate.ts";
import { oppositeChessColor } from "../utils/chessColor.ts";

function epochMilliseconds(value: Date | { epochMilliseconds: number }) {
  return value instanceof Date ? value.getTime() : value.epochMilliseconds;
}

type CreateInvitationLinkData = Parameters<typeof db.orm.public.InvitationLink.create>[0];

export async function findInvitationLink(id: number) {
  return db.orm.public.InvitationLink.where({ id }).first();
}

export async function findInvitationLinkByTokenHash(tokenHash: string) {
  return db.orm.public.InvitationLink.where({ tokenHash }).first();
}

export async function findChallengeInvitationLinks(challengeId: number, creatorId: number) {
  return db.orm.public.InvitationLink.where({ challengeId, creatorId })
    .orderBy((link) => link.createdAt.desc())
    .all();
}

export async function findInvitationLinks(limit = 100) {
  return db.orm.public.InvitationLink.orderBy((link) => link.createdAt.desc()).limit(limit).all();
}

export async function createInvitationLink(data: CreateInvitationLinkData) {
  return db.orm.public.InvitationLink.create(data);
}

export async function createChallengeInvitationLink(
  creatorId: number,
  challengeId: number,
  tokenHash: string,
  expiresAt: Date,
) {
  return db.transaction(async (tx) => {
    const challenge = await tx.orm.public.Challenge
      .where({ id: challengeId, creatorId, status: "PENDING" })
      .first();
    const challengeExpiry = challenge ? epochMilliseconds(challenge.expiresAt) : 0;
    if (
      !challenge ||
      challengeExpiry <= Date.now() ||
      expiresAt.getTime() > challengeExpiry
    ) {
      return null;
    }
    return tx.orm.public.InvitationLink.create({
      tokenHash,
      type: "FRIEND_CHALLENGE",
      creatorId,
      challengeId,
      tournamentId: null,
      maxUses: 1,
      currentUses: 0,
      expiresAt: toTemporal(expiresAt),
      status: "ACTIVE",
    });
  });
}

export async function disableChallengeInvitationLink(
  creatorId: number,
  challengeId: number,
  id: number,
) {
  return db.orm.public.InvitationLink
    .where({ id, creatorId, challengeId, status: "ACTIVE" })
    .update({ status: "DISABLED" });
}

export async function expireInvitationLink(id: number) {
  return db.orm.public.InvitationLink
    .where({ id, status: "ACTIVE" })
    .update({ status: "EXPIRED" });
}

export async function redeemChallengeInvitationLink(
  id: number,
  tokenHash: string,
  challengeId: number,
  creatorId: number,
  challengeInviteeId: number | null,
  invitedUserId: number | null,
  linkExpiresAt: Date | null,
  challengeExpiresAt: Date,
) {
  return db.transaction(async (tx) => {
    const now = new Date();
    if (
      linkExpiresAt && epochMilliseconds(linkExpiresAt) <= now.getTime() ||
      epochMilliseconds(challengeExpiresAt) <= now.getTime()
    ) return null;
    if (invitedUserId !== null) {
      const [creatorBlockedInvitee, inviteeBlockedCreator] = await Promise.all([
        tx.orm.public.BlockedUser.where({
          blockerId: creatorId,
          blockedUserId: invitedUserId,
        }).first(),
        tx.orm.public.BlockedUser.where({
          blockerId: invitedUserId,
          blockedUserId: creatorId,
        }).first(),
      ]);
      if (creatorBlockedInvitee || inviteeBlockedCreator) {
        throw Object.assign(new Error("Cette interaction n’est pas autorisée."), {
          statusCode: 403,
        });
      }
    }

    // The conditional update makes a challenge link single-use even under concurrent requests.
    const consumed = await tx.orm.public.InvitationLink
      .where({
        id,
        tokenHash,
        challengeId,
        creatorId,
        type: "FRIEND_CHALLENGE",
        status: "ACTIVE",
        maxUses: 1,
        currentUses: 0,
        expiresAt: linkExpiresAt === null ? null : toTemporal(linkExpiresAt),
      })
      .update({ currentUses: 1, status: "EXHAUSTED" });
    if (!consumed) return null;

    const accepted = await tx.orm.public.Challenge
      .where({
        id: challengeId,
        creatorId,
        status: "PENDING",
        invitedUserId: challengeInviteeId,
        expiresAt: toTemporal(challengeExpiresAt),
      })
      .update({ invitedUserId, status: "ACCEPTED", acceptedAt: toTemporal(now) });
    if (!accepted) {
      throw Object.assign(new Error("Le défi a déjà été traité."), { statusCode: 409 });
    }

    const game = await tx.orm.public.Game.where({ challengeId, status: "WAITING" }).first();
    if (!game) throw new Error(`Partie en attente absente pour le défi ${challengeId}.`);
    const creatorParticipant = await tx.orm.public.GameParticipant
      .where({ gameId: game.id, userId: creatorId, participantType: "USER" })
      .first();
    if (!creatorParticipant) {
      throw new Error(`Participant créateur absent pour le défi ${challengeId}.`);
    }

    const participant = await tx.orm.public.GameParticipant.create({
      gameId: game.id,
      participantType: invitedUserId === null ? "GUEST" : "USER",
      color: oppositeChessColor(creatorParticipant.color),
      userId: invitedUserId,
      tournamentParticipantId: null,
      displayName: null,
    });
    await tx.orm.public.InvitationLink
      .where({ challengeId, status: "ACTIVE" })
      .update({ status: "DISABLED" });

    const notifications = [
      await createNotificationInTransaction(
        tx,
        { userId: creatorId },
        "CHALLENGE_ACCEPTED",
        "Défi accepté",
        invitedUserId === null
          ? "Un invité a accepté votre défi."
          : "Votre adversaire a accepté votre défi.",
        { challengeId, gameId: game.id },
      ),
    ];
    if (invitedUserId === null) {
      notifications.push(await createNotificationInTransaction(
        tx,
        { guestParticipantId: participant.id },
        "CHALLENGE_ACCEPTED",
        "Défi accepté",
        "Vous avez accepté ce défi.",
        { challengeId, gameId: game.id },
      ));
    }
    return { challenge: accepted, game, participant, notifications };
  });
}

export async function deleteInvitationLink(id: number) {
  return db.orm.public.InvitationLink.where({ id }).delete();
}
