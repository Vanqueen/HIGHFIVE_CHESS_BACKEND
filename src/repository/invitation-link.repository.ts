import { db } from "../prisma/db.ts";

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
    if (!challenge || challenge.expiresAt <= new Date() || expiresAt > challenge.expiresAt) {
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
      expiresAt,
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
    if (linkExpiresAt && linkExpiresAt <= now || challengeExpiresAt <= now) return null;

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
        expiresAt: linkExpiresAt,
      })
      .update({ currentUses: 1, status: "EXHAUSTED" });
    if (!consumed) return null;

    const accepted = await tx.orm.public.Challenge
      .where({
        id: challengeId,
        creatorId,
        status: "PENDING",
        invitedUserId: challengeInviteeId,
        expiresAt: challengeExpiresAt,
      })
      .update({ invitedUserId, status: "ACCEPTED", acceptedAt: now });
    if (!accepted) {
      throw Object.assign(new Error("Le défi a déjà été traité."), { statusCode: 409 });
    }

    const game = await tx.orm.public.Game.where({ challengeId, status: "WAITING" }).first();
    if (!game) throw new Error(`Partie en attente absente pour le défi ${challengeId}.`);

    const participant = await tx.orm.public.GameParticipant.create({
      gameId: game.id,
      participantType: invitedUserId === null ? "GUEST" : "USER",
      color: "BLACK",
      userId: invitedUserId,
      tournamentParticipantId: null,
      displayName: null,
    });
    await tx.orm.public.InvitationLink
      .where({ challengeId, status: "ACTIVE" })
      .update({ status: "DISABLED" });

    return { challenge: accepted, game, participant };
  });
}

export async function deleteInvitationLink(id: number) {
  return db.orm.public.InvitationLink.where({ id }).delete();
}
