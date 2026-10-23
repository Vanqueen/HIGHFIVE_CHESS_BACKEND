import { Temporal } from "temporal-polyfill";
import { db } from "../prisma/db.ts";
import type { NotificationBroadcast } from "../events/notification.broadcast";
import { createNotificationInTransaction } from "./notification.repository";
import { toTemporal } from "../utils/temporalDate.ts";
import { oppositeChessColor, type ChessColor } from "../utils/chessColor.ts";
import type { RatingCategory } from "../utils/ratingCategory";

type CreateChallengeData = Parameters<typeof db.orm.public.Challenge.create>[0];
type CreateChallengeWithGameData = Omit<CreateChallengeData, "expiresAt"> & { expiresAt: Date };
type UpdateChallengeData = Parameters<
  ReturnType<typeof db.orm.public.Challenge.where>["update"]
>[0];

const STANDARD_START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function epochMilliseconds(value: Date) {
  const temporalValue = Reflect.get(value, "epochMilliseconds");
  return typeof temporalValue === "number" ? temporalValue : value.getTime();
}

export async function findChallenge(id: number) {
  return db.orm.public.Challenge.where({ id }).first();
}

export async function findChallenges(limit = 100) {
  return db.orm.public.Challenge.limit(limit).all();
}

export async function findChallengesByCreator(creatorId: number, limit = 100) {
  return db.orm.public.Challenge.where({ creatorId })
    .orderBy((challenge) => challenge.createdAt.desc())
    .limit(limit)
    .all();
}

export async function findChallengesByInvitee(invitedUserId: number, limit = 100) {
  return db.orm.public.Challenge.where({ invitedUserId })
    .orderBy((challenge) => challenge.createdAt.desc())
    .limit(limit)
    .all();
}

export async function createChallenge(data: CreateChallengeData) {
  return db.orm.public.Challenge.create(data);
}

export async function createChallengeWithGame(
  challengeData: CreateChallengeWithGameData,
  initialTimeSeconds: number,
  incrementSeconds: number,
  creatorUsername: string,
  creatorColor: ChessColor,
  isRated = false,
  ratingCategory: RatingCategory | null = null,
) {
  // Keep the challenge, its waiting game and the creator's seat consistent on failure.
  return db.transaction(async (tx) => {
    if (challengeData.invitedUserId !== null) {
      const [creatorBlockedInvitee, inviteeBlockedCreator] = await Promise.all([
        tx.orm.public.BlockedUser.where({
          blockerId: challengeData.creatorId,
          blockedUserId: challengeData.invitedUserId,
        }).first(),
        tx.orm.public.BlockedUser.where({
          blockerId: challengeData.invitedUserId,
          blockedUserId: challengeData.creatorId,
        }).first(),
      ]);
      if (creatorBlockedInvitee || inviteeBlockedCreator) {
        throw Object.assign(new Error("Cette interaction n’est pas autorisée."), {
          statusCode: 403,
        });
      }
    }
    const challenge = await tx.orm.public.Challenge.create({
      ...challengeData,
      expiresAt: toTemporal(challengeData.expiresAt),
    });
    const game = await tx.orm.public.Game.create({
      type: "CHALLENGE",
      status: "WAITING",
      isRated,
      ratingCategory,
      initialTimeSeconds,
      incrementSeconds,
      whiteTimeRemainingMs: BigInt(initialTimeSeconds) * 1000n,
      blackTimeRemainingMs: BigInt(initialTimeSeconds) * 1000n,
      activeColor: null,
      clockStartedAt: null,
      currentFen: STANDARD_START_FEN,
      startedAt: null,
      endedAt: null,
      lastActivityAt: toTemporal(new Date()),
      challengeId: challenge.id,
    });
    const participant = await tx.orm.public.GameParticipant.create({
      gameId: game.id,
      participantType: "USER",
      color: creatorColor,
      userId: challenge.creatorId,
      tournamentParticipantId: null,
      displayName: null,
    });
    const notifications = challenge.invitedUserId === null
      ? []
      : [await createNotificationInTransaction(
        tx,
        { userId: challenge.invitedUserId },
        "CHALLENGE_RECEIVED",
        "Nouveau défi",
        `${creatorUsername} vous a défié aux échecs.`,
        { challengeId: challenge.id, gameId: game.id },
      )];
    return { challenge, game, participant, notifications };
  });
}

export async function updateChallenge(id: number, updates: UpdateChallengeData) {
  return db.orm.public.Challenge.where({ id }).update(updates);
}

export async function acceptPendingChallenge(
  challengeId: number,
  invitedUserId: number,
) {
  // Recheck pending status and expiry inside the transaction to prevent double acceptance.
  return db.transaction(async (tx) => {
    const challenge = await tx.orm.public.Challenge
      .where({ id: challengeId, status: "PENDING", invitedUserId })
      .first();
    if (!challenge || epochMilliseconds(challenge.expiresAt) <= Date.now()) return null;
    const [creatorBlockedInvitee, inviteeBlockedCreator] = await Promise.all([
      tx.orm.public.BlockedUser.where({
        blockerId: challenge.creatorId,
        blockedUserId: invitedUserId,
      }).first(),
      tx.orm.public.BlockedUser.where({
        blockerId: invitedUserId,
        blockedUserId: challenge.creatorId,
      }).first(),
    ]);
    if (creatorBlockedInvitee || inviteeBlockedCreator) return null;

    const acceptedChallenge = await tx.orm.public.Challenge
      .where({ id: challengeId, status: "PENDING", invitedUserId })
      .update({ status: "ACCEPTED", acceptedAt: toTemporal(new Date()) });
    if (!acceptedChallenge) return null;

    const game = await tx.orm.public.Game.where({ challengeId }).first();
    if (!game) throw new Error(`Partie absente pour le défi ${challengeId}.`);
    const creatorParticipant = await tx.orm.public.GameParticipant
      .where({ gameId: game.id, userId: challenge.creatorId, participantType: "USER" })
      .first();
    if (!creatorParticipant) {
      throw new Error(`Participant créateur absent pour le défi ${challengeId}.`);
    }
    const participant = await tx.orm.public.GameParticipant.create({
      gameId: game.id,
      participantType: "USER",
      color: oppositeChessColor(creatorParticipant.color),
      userId: invitedUserId,
      tournamentParticipantId: null,
      displayName: null,
    });
    await tx.orm.public.InvitationLink
      .where({ challengeId, status: "ACTIVE" })
      .update({ status: "DISABLED" });
    const notification = await createNotificationInTransaction(
      tx,
      { userId: acceptedChallenge.creatorId },
      "CHALLENGE_ACCEPTED",
      "Défi accepté",
      "Votre adversaire a accepté votre défi.",
      { challengeId, gameId: game.id },
    );
    return { challenge: acceptedChallenge, game, participant, notifications: [notification] };
  });
}

type ChallengeClosedAction = "declined" | "cancelled" | "expired";

const inFlightChallengeExpirations = new Set<number>();

async function transitionPendingChallenge(
  challengeId: number,
  selector: { creatorId?: number; invitedUserId?: number },
  status: "CANCELLED" | "EXPIRED",
  action: ChallengeClosedAction,
) {
  // A cancelled or expired invitation must not leave its associated game joinable.
  return db.transaction(async (tx) => {
    const now = Temporal.Now.instant();
    const eligibleChallenge = tx.orm.public.Challenge
      .where({ id: challengeId, status: "PENDING", ...selector });
    const updated = status === "EXPIRED"
      ? await eligibleChallenge.where((challenge) => challenge.expiresAt.lte(now))
        .update({ status })
      : await eligibleChallenge.update({ status });
    if (!updated) return null;

    const game = await tx.orm.public.Game.where({ challengeId }).first();
    if (!game) throw new Error(`Partie absente pour le défi ${challengeId}.`);

    await tx.orm.public.InvitationLink
      .where({ challengeId, status: "ACTIVE" })
      .update({ status: "DISABLED" });
    await tx.orm.public.Game
      .where({ challengeId, status: "WAITING" })
      .update({
        status: "CANCELLED",
        terminationReason: "CANCELLED",
        endedAt: now,
      });

    const recipients = new Map<string, { userId: number } | { guestParticipantId: number }>();
    const addUser = (userId: number | null) => {
      if (userId !== null) recipients.set(`user:${userId}`, { userId });
    };
    if (action === "declined") {
      addUser(updated.creatorId);
    } else if (action === "cancelled") {
      addUser(updated.invitedUserId);
    } else {
      addUser(updated.creatorId);
      addUser(updated.invitedUserId);
    }

    const guestParticipants = await tx.orm.public.GameParticipant
      .where({ gameId: game.id, participantType: "GUEST" })
      .all();
    if (action !== "declined") {
      for (const participant of guestParticipants) {
        recipients.set(`guest:${participant.id}`, { guestParticipantId: participant.id });
      }
    }

    const content = {
      declined: "Le joueur invité a refusé votre défi.",
      cancelled: "Le défi a été annulé.",
      expired: "Le défi a expiré.",
    }[action];
    const notifications: NotificationBroadcast[] = [];
    for (const recipient of recipients.values()) {
      notifications.push(await createNotificationInTransaction(
        tx,
        recipient,
        "SYSTEM",
        action === "expired" ? "Défi expiré" : "Mise à jour du défi",
        content,
        { challengeId, gameId: game.id, action },
      ));
    }
    return {
      challenge: updated,
      game: {
        ...game,
        status: "CANCELLED" as const,
        terminationReason: "CANCELLED" as const,
        endedAt: now,
      },
      notifications,
    };
  });
}

export async function cancelPendingChallenge(challengeId: number, creatorId: number) {
  return transitionPendingChallenge(challengeId, { creatorId }, "CANCELLED", "cancelled");
}

export async function declinePendingChallenge(challengeId: number, invitedUserId: number) {
  return transitionPendingChallenge(challengeId, { invitedUserId }, "CANCELLED", "declined");
}

export async function expirePendingChallenge(challengeId: number) {
  if (inFlightChallengeExpirations.has(challengeId)) return null;
  inFlightChallengeExpirations.add(challengeId);
  try {
    return await transitionPendingChallenge(challengeId, {}, "EXPIRED", "expired");
  } finally {
    inFlightChallengeExpirations.delete(challengeId);
  }
}

export async function expireDuePendingChallenges(limit = 100) {
  const now = Temporal.Now.instant();
  const challenges = await db.orm.public.Challenge
    .where({ status: "PENDING" })
    .where((challenge) => challenge.expiresAt.lte(now))
    .orderBy((challenge) => challenge.expiresAt.asc())
    .limit(limit)
    .all();
  const results = [];
  for (const challenge of challenges) {
    const expired = await expirePendingChallenge(challenge.id);
    if (expired) results.push(expired);
  }
  return results;
}

export async function deleteChallenge(id: number) {
  return db.orm.public.Challenge.where({ id }).delete();
}
