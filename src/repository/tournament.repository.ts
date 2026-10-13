import { db } from "../prisma/db.ts";
import { calculateTournamentRatingChanges } from "../service/tournamentRating";
import { Temporal } from "temporal-polyfill";

const STANDARD_START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

type CreateTournamentData = Parameters<typeof db.orm.public.Tournament.create>[0];
type CreateTournamentParticipantData =
  Parameters<typeof db.orm.public.TournamentParticipant.create>[0];

export interface TournamentPairing {
  white: {
    id: number;
    userId: number;
    displayName: string;
  };
  black: {
    id: number;
    userId: number;
    displayName: string;
  };
}

export async function expireTournamentInvitationLink(id: number) {
  return db.orm.public.InvitationLink
    .where({ id, type: "TOURNAMENT", status: "ACTIVE" })
    .update({ status: "EXPIRED" });
}

export interface TournamentRoundSetup {
  initialTimeSeconds: number;
  incrementSeconds: number;
  pairings: TournamentPairing[];
  byeParticipantId?: number;
}

export interface TournamentStandingUpdate {
  participantId: number;
  score: number;
  wins: number;
  draws: number;
  losses: number;
}

export async function findTournament(id: number) {
  return db.orm.public.Tournament.where({ id }).first();
}

export async function findTournaments(limit = 100) {
  return db.orm.public.Tournament
    .orderBy((tournament) => tournament.startsAt.asc())
    .limit(limit)
    .all();
}

export async function createTournament(data: CreateTournamentData) {
  return db.orm.public.Tournament.create(data);
}

export async function findTournamentParticipants(tournamentId: number) {
  return db.orm.public.TournamentParticipant
    .where({ tournamentId })
    .orderBy((participant) => participant.joinedAt.asc())
    .all();
}

export async function findTournamentRounds(tournamentId: number) {
  return db.orm.public.TournamentRound
    .where({ tournamentId })
    .orderBy((round) => round.roundNumber.asc())
    .all();
}

export async function findTournamentParticipantByUser(tournamentId: number, userId: number) {
  return db.orm.public.TournamentParticipant.where({ tournamentId, userId }).first();
}

export async function findTournamentGameRows(roundId: number) {
  return db.orm.public.Game.where({ tournamentRoundId: roundId })
    .orderBy((game) => game.createdAt.asc())
    .all();
}

export async function findGamePlayerRows(gameId: number) {
  return db.orm.public.GameParticipant.where({ gameId }).all();
}

export async function findTournamentInvitationLinks(tournamentId: number) {
  return db.orm.public.InvitationLink
    .where({ tournamentId, type: "TOURNAMENT" })
    .orderBy((link) => link.createdAt.desc())
    .all();
}

export async function registerTournamentUser(
  tournamentId: number,
  userId: number,
  displayName: string,
  invitationLinkId: number | null = null,
) {
  return db.transaction(async (tx) => {
    const now = Temporal.Now.instant();
    const opened = await tx.orm.public.Tournament
      .where({ id: tournamentId, status: "REGISTRATION_OPEN" })
      .update({ status: "REGISTRATION_OPEN" });
    if (!opened) {
      const tournament = await tx.orm.public.Tournament.where({ id: tournamentId }).first();
      return tournament
        ? { kind: "closed" as const }
        : { kind: "missing" as const };
    }
    const tournament = await tx.orm.public.Tournament.where({ id: tournamentId }).first();
    if (!tournament) return { kind: "missing" as const };
    if (
      tournament.status !== "REGISTRATION_OPEN" ||
      tournament.registrationStartsAt.epochMilliseconds > now.epochMilliseconds ||
      tournament.registrationEndsAt.epochMilliseconds <= now.epochMilliseconds
    ) {
      return { kind: "closed" as const };
    }

    let invitationLink = null;
    if (invitationLinkId !== null) {
      invitationLink = await tx.orm.public.InvitationLink
        .where({ id: invitationLinkId, tournamentId, type: "TOURNAMENT", status: "ACTIVE" })
        .first();
      if (!invitationLink || (invitationLink.expiresAt && invitationLink.expiresAt <= now)) {
        return { kind: "invalid-link" as const };
      }
      if (
        invitationLink.maxUses !== null &&
        invitationLink.currentUses >= invitationLink.maxUses
      ) {
        return { kind: "link-exhausted" as const };
      }
    }

    const existing = await tx.orm.public.TournamentParticipant
      .where({ tournamentId, userId })
      .first();
    if (existing && existing.status !== "WITHDRAWN") {
      return { kind: "duplicate" as const };
    }

    const currentParticipants = await tx.orm.public.TournamentParticipant
      .where({ tournamentId })
      .all();
    const activeCount = currentParticipants.filter((participant) =>
      participant.status === "REGISTERED" || participant.status === "ACTIVE"
    ).length;
    if (!existing && activeCount >= tournament.maxParticipants) {
      return { kind: "full" as const };
    }

    if (invitationLink) {
      const consumed = await tx.orm.public.InvitationLink
        .where({
          id: invitationLink.id,
          status: "ACTIVE",
          currentUses: invitationLink.currentUses,
        })
        .update({
          currentUses: invitationLink.currentUses + 1,
          ...(invitationLink.maxUses !== null &&
            invitationLink.currentUses + 1 >= invitationLink.maxUses
            ? { status: "EXHAUSTED" as const }
            : {}),
        });
      if (!consumed) return { kind: "invalid-link" as const };
    }

    const participantData: CreateTournamentParticipantData = {
      tournamentId,
      userId,
      participantType: "USER",
      displayName,
      accessTokenHash: null,
      invitationLinkId,
      status: "REGISTERED",
      seed: existing?.seed ?? activeCount + 1,
      score: "0",
      wins: 0,
      draws: 0,
      losses: 0,
      joinedAt: now,
      leftAt: null,
      eliminatedAt: null,
    };
    if (existing) {
      const participant = await tx.orm.public.TournamentParticipant
        .where({ id: existing.id, status: "WITHDRAWN" })
        .update({
          participantType: "USER",
          displayName,
          invitationLinkId,
          status: "REGISTERED",
          score: "0",
          wins: 0,
          draws: 0,
          losses: 0,
          joinedAt: now,
          leftAt: null,
          eliminatedAt: null,
        });
      return participant
        ? { kind: "registered" as const, participant }
        : { kind: "duplicate" as const };
    }

    const participant = await tx.orm.public.TournamentParticipant.create(participantData);
    return { kind: "registered" as const, participant };
  });
}

export async function withdrawTournamentUser(tournamentId: number, userId: number) {
  return db.transaction(async (tx) => {
    const tournament = await tx.orm.public.Tournament.where({ id: tournamentId }).first();
    if (!tournament) return { kind: "missing" as const };
    if (tournament.status !== "REGISTRATION_OPEN") return { kind: "closed" as const };
    const participant = await tx.orm.public.TournamentParticipant
      .where({ tournamentId, userId, status: "REGISTERED" })
      .first();
    if (!participant) return { kind: "not-registered" as const };
    const updated = await tx.orm.public.TournamentParticipant
      .where({ id: participant.id, status: "REGISTERED" })
      .update({ status: "WITHDRAWN", leftAt: Temporal.Now.instant() });
    return updated
      ? { kind: "withdrawn" as const, participant: updated }
      : { kind: "not-registered" as const };
  });
}

export async function createTournamentInvitationLink(data: {
  tokenHash: string;
  tournamentId: number;
  creatorId: number;
  maxUses: number | null;
  expiresAt: Date | null;
}) {
  const tournament = await db.orm.public.Tournament.where({
    id: data.tournamentId,
    organizerId: data.creatorId,
  }).first();
  if (!tournament || tournament.status === "CANCELLED" || tournament.status === "FINISHED") {
    return null;
  }
  return db.orm.public.InvitationLink.create({
    tokenHash: data.tokenHash,
    type: "TOURNAMENT",
    creatorId: data.creatorId,
    tournamentId: data.tournamentId,
    challengeId: null,
    maxUses: data.maxUses,
    currentUses: 0,
    expiresAt: data.expiresAt,
    status: "ACTIVE",
  });
}

export async function findTournamentInvitationLink(tokenHash: string) {
  return db.orm.public.InvitationLink.where({ tokenHash, type: "TOURNAMENT" }).first();
}

export async function revokeTournamentInvitationLink(
  tournamentId: number,
  creatorId: number,
  linkId: number,
) {
  const tournament = await findTournament(tournamentId);
  if (!tournament || tournament.organizerId !== creatorId) return false;
  return db.orm.public.InvitationLink
    .where({ id: linkId, tournamentId, creatorId, type: "TOURNAMENT", status: "ACTIVE" })
    .update({ status: "DISABLED" });
}

export async function setTournamentStatus(
  tournamentId: number,
  organizerId: number,
  currentStatus: "DRAFT" | "REGISTRATION_OPEN" | "REGISTRATION_CLOSED" | "IN_PROGRESS",
  nextStatus: "REGISTRATION_OPEN" | "REGISTRATION_CLOSED" | "IN_PROGRESS" | "FINISHED" | "CANCELLED",
) {
  return db.orm.public.Tournament
    .where({ id: tournamentId, organizerId, status: currentStatus })
    .update({ status: nextStatus });
}

async function createRound(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  tournament: { id: number; isRated: boolean; ratingCategory: "BLITZ" | "RAPID" | "CLASSICAL" | null },
  tournamentId: number,
  roundNumber: number,
  setup: TournamentRoundSetup,
) {
  const now = Temporal.Now.instant();
  const round = await tx.orm.public.TournamentRound.create({
    tournamentId,
    roundNumber,
    status: "IN_PROGRESS",
    startsAt: now,
    endsAt: null,
  });
  const games = [];
  for (const pairing of setup.pairings) {
    const game = await tx.orm.public.Game.create({
      type: "TOURNAMENT",
      status: "WAITING",
      result: null,
      terminationReason: null,
      isRated: tournament.isRated,
      ratingCategory: tournament.isRated ? tournament.ratingCategory : null,
      initialTimeSeconds: setup.initialTimeSeconds,
      incrementSeconds: setup.incrementSeconds,
      whiteTimeRemainingMs: BigInt(setup.initialTimeSeconds) * 1000n,
      blackTimeRemainingMs: BigInt(setup.initialTimeSeconds) * 1000n,
      activeColor: null,
      clockStartedAt: null,
      currentFen: STANDARD_START_FEN,
      startedAt: null,
      endedAt: null,
      lastActivityAt: now,
      lastMoveAt: null,
      challengeId: null,
      tournamentRoundId: round.id,
      drawOfferParticipantId: null,
      pendingUndoParticipantId: null,
    });
    const white = await tx.orm.public.GameParticipant.create({
      gameId: game.id,
      participantType: "USER",
      color: "WHITE",
      userId: pairing.white.userId,
      tournamentParticipantId: pairing.white.id,
      displayName: pairing.white.displayName,
    });
    const black = await tx.orm.public.GameParticipant.create({
      gameId: game.id,
      participantType: "USER",
      color: "BLACK",
      userId: pairing.black.userId,
      tournamentParticipantId: pairing.black.id,
      displayName: pairing.black.displayName,
    });
    games.push({ game, participants: [white, black] });
  }

  if (setup.byeParticipantId !== undefined) {
    const participant = await tx.orm.public.TournamentParticipant
      .where({ id: setup.byeParticipantId, tournamentId, status: "ACTIVE" })
      .first();
    if (!participant) throw new Error("Participant bye introuvable.");
    await tx.orm.public.TournamentParticipant
      .where({ id: participant.id, status: "ACTIVE" })
      .update({
        score: (Number(participant.score) + 1).toFixed(1),
      });
  }
  return { round, games };
}

async function applyTournamentRatings(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  tournamentId: number,
) {
  const rounds = await tx.orm.public.TournamentRound.where({ tournamentId }).all();
  const games = [];
  for (const round of rounds) {
    games.push(...await tx.orm.public.Game
      .where({ tournamentRoundId: round.id, isRated: true, status: "FINISHED" })
      .all());
  }
  const rateableGames = games.filter((game) =>
    game.terminationReason !== "NO_SHOW" && game.lastMoveAt !== null
  );
  rateableGames.sort((left, right) =>
    (left.endedAt?.epochMilliseconds ?? 0) -
      (right.endedAt?.epochMilliseconds ?? 0) || left.id - right.id
  );

  const ratingUserIds = new Set<number>();
  for (const game of rateableGames) {
    const participants = await tx.orm.public.GameParticipant.where({ gameId: game.id }).all();
    for (const participant of participants) {
      if (participant.participantType === "USER" && participant.userId !== null) {
        ratingUserIds.add(participant.userId);
      }
    }
  }
  for (const userId of [...ratingUserIds].sort((left, right) => left - right)) {
    const user = await tx.orm.public.User.where({ id: userId }).first();
    if (!user) throw new Error(`Compte introuvable pendant le rating : ${userId}.`);
    const locked = await tx.orm.public.User
      .where({ id: userId, accountStatus: user.accountStatus })
      .update({ accountStatus: user.accountStatus });
    if (!locked) throw new Error(`Impossible de verrouiller le compte ${userId} pour le rating.`);
  }

  for (const game of rateableGames) {
    if (!game.ratingCategory || !game.result) {
      throw new Error(`Paramètres de rating absents pour la partie ${game.id}.`);
    }

    // A no-op row update serializes retries for this game without adding a schema field.
    const locked = await tx.orm.public.Game
      .where({ id: game.id, status: "FINISHED", isRated: true })
      .update({ isRated: true });
    if (!locked) continue;
    const existingHistory = await tx.orm.public.RatingHistory.where({ gameId: game.id }).all();
    if (existingHistory.length) continue;

    const participants = await tx.orm.public.GameParticipant.where({ gameId: game.id }).all();
    const white = participants.find((participant) =>
      participant.color === "WHITE" &&
      participant.participantType === "USER" &&
      participant.userId !== null
    );
    const black = participants.find((participant) =>
      participant.color === "BLACK" &&
      participant.participantType === "USER" &&
      participant.userId !== null
    );
    if (!white?.userId || !black?.userId || white.userId === black.userId) {
      throw new Error(`Participants de rating invalides pour la partie ${game.id}.`);
    }

    const ratings = await Promise.all([
      tx.orm.public.Rating.where({
        userId: white.userId,
        category: game.ratingCategory,
      }).first(),
      tx.orm.public.Rating.where({
        userId: black.userId,
        category: game.ratingCategory,
      }).first(),
    ]);
    const whiteRating = ratings[0] ?? await tx.orm.public.Rating.create({
      userId: white.userId,
      category: game.ratingCategory,
      rating: 1500,
      gamesPlayed: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      provisional: true,
    });
    const blackRating = ratings[1] ?? await tx.orm.public.Rating.create({
      userId: black.userId,
      category: game.ratingCategory,
      rating: 1500,
      gamesPlayed: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      provisional: true,
    });

    const changes = calculateTournamentRatingChanges(
      whiteRating.rating,
      blackRating.rating,
      game.result,
    );
    const whiteChange = changes.white;
    const blackChange = changes.black;
    const whiteAfter = whiteRating.rating + whiteChange;
    const blackAfter = blackRating.rating + blackChange;
    const actualWhite = game.result === "WHITE_WIN" ? 1 : game.result === "DRAW" ? 0.5 : 0;
    const actualBlack = 1 - actualWhite;

    await tx.orm.public.Rating.where({ id: whiteRating.id }).update({
      rating: whiteAfter,
      gamesPlayed: whiteRating.gamesPlayed + 1,
      wins: whiteRating.wins + (actualWhite === 1 ? 1 : 0),
      losses: whiteRating.losses + (actualWhite === 0 ? 1 : 0),
      draws: whiteRating.draws + (actualWhite === 0.5 ? 1 : 0),
      provisional: whiteRating.gamesPlayed + 1 < 20,
    });
    await tx.orm.public.Rating.where({ id: blackRating.id }).update({
      rating: blackAfter,
      gamesPlayed: blackRating.gamesPlayed + 1,
      wins: blackRating.wins + (actualBlack === 1 ? 1 : 0),
      losses: blackRating.losses + (actualBlack === 0 ? 1 : 0),
      draws: blackRating.draws + (actualBlack === 0.5 ? 1 : 0),
      provisional: blackRating.gamesPlayed + 1 < 20,
    });

    await tx.orm.public.RatingHistory.create({
      ratingId: whiteRating.id,
      gameId: game.id,
      ratingBefore: whiteRating.rating,
      ratingAfter: whiteAfter,
      ratingChange: whiteChange,
      opponentRating: blackRating.rating,
      result: game.result,
    });
    await tx.orm.public.RatingHistory.create({
      ratingId: blackRating.id,
      gameId: game.id,
      ratingBefore: blackRating.rating,
      ratingAfter: blackAfter,
      ratingChange: blackChange,
      opponentRating: whiteRating.rating,
      result: game.result === "WHITE_WIN"
        ? "BLACK_WIN"
        : game.result === "BLACK_WIN"
          ? "WHITE_WIN"
          : "DRAW",
    });
  }
}

export async function startTournamentWithRound(
  tournamentId: number,
  organizerId: number,
  setup: TournamentRoundSetup,
) {
  return db.transaction(async (tx) => {
    const tournament = await tx.orm.public.Tournament
      .where({ id: tournamentId, organizerId, status: "REGISTRATION_CLOSED" })
      .first();
    if (
      !tournament ||
      tournament.startsAt.epochMilliseconds > Temporal.Now.instant().epochMilliseconds
    ) return null;

    const participants = await tx.orm.public.TournamentParticipant
      .where({ tournamentId, status: "REGISTERED" })
      .all();
    if (participants.length < 2) return null;

    await tx.orm.public.Tournament
      .where({ id: tournamentId, organizerId, status: "REGISTRATION_CLOSED" })
      .update({ status: "IN_PROGRESS" });
    await tx.orm.public.TournamentParticipant
      .where({ tournamentId, status: "REGISTERED" })
      .update({ status: "ACTIVE" });
    return createRound(tx, tournament, tournamentId, 1, setup);
  });
}

export async function advanceTournamentRound(
  tournamentId: number,
  organizerId: number,
  expectedRoundNumber: number,
  setup: TournamentRoundSetup,
  finishTournament: boolean,
  standings: TournamentStandingUpdate[],
) {
  return db.transaction(async (tx) => {
    const tournament = await tx.orm.public.Tournament
      .where({ id: tournamentId, organizerId, status: "IN_PROGRESS" })
      .first();
    if (!tournament) return null;
    const round = await tx.orm.public.TournamentRound
      .where({ tournamentId, roundNumber: expectedRoundNumber, status: "IN_PROGRESS" })
      .first();
    if (!round) return null;
    const games = await tx.orm.public.Game.where({ tournamentRoundId: round.id }).all();
    if (games.some((game) => game.status !== "FINISHED")) return null;

    const now = Temporal.Now.instant();
    await tx.orm.public.TournamentRound
      .where({ id: round.id, status: "IN_PROGRESS" })
      .update({ status: "FINISHED", endsAt: now });

    for (const standing of standings) {
      await tx.orm.public.TournamentParticipant
        .where({ id: standing.participantId, tournamentId })
        .update({
          score: standing.score.toFixed(1),
          wins: standing.wins,
          draws: standing.draws,
          losses: standing.losses,
        });
    }

    if (finishTournament) {
      await applyTournamentRatings(tx, tournamentId);
      await tx.orm.public.Tournament
        .where({ id: tournamentId, organizerId, status: "IN_PROGRESS" })
        .update({ status: "FINISHED", endsAt: now });
      await tx.orm.public.TournamentParticipant
        .where({ tournamentId, status: "ACTIVE" })
        .update({ status: "FINISHED" });
      return { finished: true as const, round };
    }

    const created = await createRound(
      tx,
      tournament,
      tournamentId,
      expectedRoundNumber + 1,
      setup,
    );
    return { finished: false as const, ...created };
  });
}

export async function cancelTournament(
  tournamentId: number,
  organizerId: number,
) {
  return db.transaction(async (tx) => {
    const current = await tx.orm.public.Tournament
      .where({ id: tournamentId, organizerId })
      .first();
    if (
      !current ||
      (current.status !== "DRAFT" &&
        current.status !== "REGISTRATION_OPEN" &&
        current.status !== "REGISTRATION_CLOSED")
    ) return false;
    const tournament = await tx.orm.public.Tournament
      .where({ id: tournamentId, organizerId, status: current.status })
      .update({ status: "CANCELLED", endsAt: Temporal.Now.instant() });
    if (!tournament) return false;
    await tx.orm.public.InvitationLink
      .where({ tournamentId, status: "ACTIVE" })
      .update({ status: "DISABLED" });
    return true;
  });
}
