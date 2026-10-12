import { db } from "../prisma/db.ts";

type CreateChallengeData = Parameters<typeof db.orm.public.Challenge.create>[0];
type UpdateChallengeData = Parameters<
  ReturnType<typeof db.orm.public.Challenge.where>["update"]
>[0];

const STANDARD_START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

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
  challengeData: CreateChallengeData,
  initialTimeSeconds: number,
  incrementSeconds: number,
) {
  // Keep the challenge, its waiting game and the creator's seat consistent on failure.
  return db.transaction(async (tx) => {
    const challenge = await tx.orm.public.Challenge.create(challengeData);
    const game = await tx.orm.public.Game.create({
      type: "CHALLENGE",
      status: "WAITING",
      isRated: false,
      ratingCategory: null,
      initialTimeSeconds,
      incrementSeconds,
      whiteTimeRemainingMs: BigInt(initialTimeSeconds) * 1000n,
      blackTimeRemainingMs: BigInt(initialTimeSeconds) * 1000n,
      activeColor: null,
      clockStartedAt: null,
      currentFen: STANDARD_START_FEN,
      startedAt: null,
      endedAt: null,
      lastActivityAt: new Date(),
      challengeId: challenge.id,
    });
    const participant = await tx.orm.public.GameParticipant.create({
      gameId: game.id,
      participantType: "USER",
      color: "WHITE",
      userId: challenge.creatorId,
      tournamentParticipantId: null,
      displayName: null,
    });
    return { challenge, game, participant };
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
    if (!challenge || challenge.expiresAt <= new Date()) return null;

    const acceptedChallenge = await tx.orm.public.Challenge
      .where({ id: challengeId, status: "PENDING", invitedUserId })
      .update({ status: "ACCEPTED", acceptedAt: new Date() });
    if (!acceptedChallenge) return null;

    const game = await tx.orm.public.Game.where({ challengeId }).first();
    if (!game) throw new Error(`Partie absente pour le défi ${challengeId}.`);
    const participant = await tx.orm.public.GameParticipant.create({
      gameId: game.id,
      participantType: "USER",
      color: "BLACK",
      userId: invitedUserId,
      tournamentParticipantId: null,
      displayName: null,
    });
    await tx.orm.public.InvitationLink
      .where({ challengeId, status: "ACTIVE" })
      .update({ status: "DISABLED" });
    return { challenge: acceptedChallenge, game, participant };
  });
}

async function transitionPendingChallenge(
  challengeId: number,
  selector: { creatorId?: number; invitedUserId?: number },
  status: "CANCELLED" | "EXPIRED",
) {
  // A cancelled or expired invitation must not leave its associated game joinable.
  return db.transaction(async (tx) => {
    const updated = await tx.orm.public.Challenge
      .where({ id: challengeId, status: "PENDING", ...selector })
      .update({ status });
    if (!updated) return null;
    await tx.orm.public.InvitationLink
      .where({ challengeId, status: "ACTIVE" })
      .update({ status: "DISABLED" });
    await tx.orm.public.Game
      .where({ challengeId, status: "WAITING" })
      .update({ status: "CANCELLED", terminationReason: "CANCELLED", endedAt: new Date() });
    return updated;
  });
}

export async function cancelPendingChallenge(challengeId: number, creatorId: number) {
  return transitionPendingChallenge(challengeId, { creatorId }, "CANCELLED");
}

export async function declinePendingChallenge(challengeId: number, invitedUserId: number) {
  return transitionPendingChallenge(challengeId, { invitedUserId }, "CANCELLED");
}

export async function expirePendingChallenge(challengeId: number) {
  return transitionPendingChallenge(challengeId, {}, "EXPIRED");
}

export async function deleteChallenge(id: number) {
  return db.orm.public.Challenge.where({ id }).delete();
}
