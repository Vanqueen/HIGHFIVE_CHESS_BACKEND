import dotenv from "dotenv";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { Chess } from "chess.js";
import express from "express";
import jwt from "jsonwebtoken";
import { Temporal } from "temporal-polyfill";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { io as createSocketClient, type Socket } from "socket.io-client";
import { CONNECTION_EVENTS } from "../events/connection.events";
import { GAME_EVENTS } from "../events/game.events";
import { MOVE_EVENTS } from "../events/move.events";
import { subscribeToNotifications } from "../events/notification.broadcast";

const inheritedEnvironment = { ...process.env };
const baseEnvPath = resolve(process.cwd(), ".env");
const baseEnvironment = existsSync(baseEnvPath)
  ? dotenv.parse(readFileSync(baseEnvPath))
  : {};
const requestedNodeEnv = inheritedEnvironment.NODE_ENV?.trim();
const hasTestEnvironmentFile = existsSync(resolve(process.cwd(), ".env.test"));
const integrationNodeEnv = requestedNodeEnv && requestedNodeEnv !== "test"
  ? requestedNodeEnv
  : hasTestEnvironmentFile
  ? "test"
  : baseEnvironment.NODE_ENV?.trim() || requestedNodeEnv || "development";
const selectedEnvPath = resolve(process.cwd(), `.env.${integrationNodeEnv}`);
const selectedEnvironment = existsSync(selectedEnvPath)
  ? dotenv.parse(readFileSync(selectedEnvPath))
  : {};
const testDatabaseUrl = inheritedEnvironment.TEST_DATABASE_URL?.trim() ||
  selectedEnvironment.TEST_DATABASE_URL?.trim() ||
  (integrationNodeEnv === "production"
    ? undefined
    : inheritedEnvironment.DATABASE_URL?.trim() ||
      selectedEnvironment.DATABASE_URL?.trim() ||
      baseEnvironment.DATABASE_URL?.trim());
const originalDatabaseUrl = process.env.DATABASE_URL;
const originalAccessSecret = process.env.JWT_ACCESS_SECRET;
let database: typeof import("./db.ts")["db"] | undefined;
let closeDatabase: (() => Promise<void>) | undefined;
let finishGame: typeof import("../repository/game-action.repository")["finishGame"];
let finishGameOnTimeout: typeof import("../repository/game-action.repository")["finishGameOnTimeout"];
let resolveDrawOffer: typeof import("../repository/game-action.repository")["resolveDrawOffer"];
let claimGameNoShow: typeof import("../repository/game-action.repository")["claimGameNoShow"];
let moveService: typeof import("../service/moveService")["MoveService"];
let finalizeGameFinishedEffects: typeof import("../service/gameFinishedEffects")["finalizeGameFinishedEffects"];
let registerTournamentUser: typeof import("../repository/tournament.repository")["registerTournamentUser"];
let advanceTournamentRound: typeof import("../repository/tournament.repository")["advanceTournamentRound"];
const createdGameIds: number[] = [];
const createdTournamentIds: number[] = [];
const createdUserIds: number[] = [];

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function requireDatabase() {
  if (!database) throw new Error("PostgreSQL integration database is not connected.");
  return database;
}

async function createRatedGameFixture() {
  const db = requireDatabase();
  const suffix = randomUUID();
  const whiteUser = await db.orm.public.User.create({
    username: `it-white-${suffix}`,
    email: `it-white-${suffix}@example.test`,
    passwordHash: "integration-test-only",
  });
  createdUserIds.push(whiteUser.id);
  const blackUser = await db.orm.public.User.create({
    username: `it-black-${suffix}`,
    email: `it-black-${suffix}@example.test`,
    passwordHash: "integration-test-only",
  });
  createdUserIds.push(blackUser.id);

  const game = await db.orm.public.Game.create({
    type: "ONLINE",
    status: "IN_PROGRESS",
    result: null,
    terminationReason: null,
    isRated: true,
    ratingCategory: "BLITZ",
    initialTimeSeconds: 300,
    incrementSeconds: 0,
    whiteTimeRemainingMs: 300_000n,
    blackTimeRemainingMs: 300_000n,
    activeColor: "WHITE",
    clockStartedAt: Temporal.Now.instant(),
    currentFen: START_FEN,
    startedAt: Temporal.Now.instant(),
    endedAt: null,
    lastActivityAt: Temporal.Now.instant(),
    lastMoveAt: null,
    challengeId: null,
    tournamentRoundId: null,
    drawOfferParticipantId: null,
    pendingUndoParticipantId: null,
  });
  createdGameIds.push(game.id);

  const white = await db.orm.public.GameParticipant.create({
    gameId: game.id,
    participantType: "USER",
    color: "WHITE",
    userId: whiteUser.id,
    tournamentParticipantId: null,
    displayName: whiteUser.username,
  });
  const black = await db.orm.public.GameParticipant.create({
    gameId: game.id,
    participantType: "USER",
    color: "BLACK",
    userId: blackUser.id,
    tournamentParticipantId: null,
    displayName: blackUser.username,
  });

  return { game, whiteUser, blackUser, white, black };
}

async function createTournamentFixture(
  maxParticipants: number,
  isRated = false,
  playerCount = maxParticipants,
) {
  const db = requireDatabase();
  const suffix = randomUUID();
  const organizer = await db.orm.public.User.create({
    username: `it-organizer-${suffix}`,
    email: `it-organizer-${suffix}@example.test`,
    passwordHash: "integration-test-only",
    role: "ORGANIZER",
  });
  createdUserIds.push(organizer.id);

  const players = await Promise.all(
    Array.from({ length: playerCount }, async (_, index) => {
      const user = await db.orm.public.User.create({
        username: `it-player-${index}-${suffix}`,
        email: `it-player-${index}-${suffix}@example.test`,
        passwordHash: "integration-test-only",
      });
      createdUserIds.push(user.id);
      return user;
    }),
  );

  const now = Temporal.Now.instant();
  const tournament = await db.orm.public.Tournament.create({
    name: `Integration ${suffix}`,
    description: null,
    organizerId: organizer.id,
    format: "SWISS",
    status: "REGISTRATION_OPEN",
    maxParticipants,
    registrationStartsAt: Temporal.Instant.fromEpochMilliseconds(now.epochMilliseconds - 60_000),
    registrationEndsAt: Temporal.Instant.fromEpochMilliseconds(now.epochMilliseconds + 3_600_000),
    startsAt: Temporal.Instant.fromEpochMilliseconds(now.epochMilliseconds + 7_200_000),
    endsAt: null,
    isRated,
    ratingCategory: isRated ? "RAPID" : null,
  });
  createdTournamentIds.push(tournament.id);

  return { organizer, players, tournament };
}

async function cleanupFixtures() {
  const db = requireDatabase();
  for (const gameId of createdGameIds) {
    const histories = await db.orm.public.RatingHistory.where({ gameId }).all();
    for (const history of histories) {
      await db.orm.public.RatingHistory.where({ id: history.id }).delete();
    }
    await db.orm.public.Game.where({ id: gameId }).delete();
  }
  createdGameIds.length = 0;
  for (const tournamentId of createdTournamentIds) {
    await db.orm.public.Tournament.where({ id: tournamentId }).delete();
  }
  createdTournamentIds.length = 0;
  for (const userId of createdUserIds) {
    const notifications = await db.orm.public.Notification.where({ userId }).all();
    for (const notification of notifications) {
      await db.orm.public.Notification.where({ id: notification.id }).delete();
    }
    await db.orm.public.Rating.where({ userId }).delete();
    await db.orm.public.User.where({ id: userId }).delete();
  }
  createdUserIds.length = 0;
}

describe.skipIf(!testDatabaseUrl)("PostgreSQL game-finished integration", () => {
  beforeAll(async () => {
    if (!testDatabaseUrl) throw new Error("No integration database URL was configured.");
    process.env.DATABASE_URL = testDatabaseUrl;
    const dbModule = await import("./db.ts");
    database = dbModule.db;
    closeDatabase = () => dbModule.db.close();
    await dbModule.connectDatabase();
    ({ finishGame, finishGameOnTimeout, resolveDrawOffer, claimGameNoShow } =
      await import("../repository/game-action.repository"));
    ({ MoveService: moveService } = await import("../service/moveService"));
    ({ finalizeGameFinishedEffects } = await import("../service/gameFinishedEffects"));
    ({ registerTournamentUser, advanceTournamentRound } =
      await import("../repository/tournament.repository"));
  }, 30_000);

  afterEach(async () => {
    await cleanupFixtures();
  }, 30_000);

  afterAll(async () => {
    await closeDatabase?.();
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
    if (originalAccessSecret === undefined) {
      delete process.env.JWT_ACCESS_SECRET;
    } else {
      process.env.JWT_ACCESS_SECRET = originalAccessSecret;
    }
  });

  it("connects to the configured database and reads the migrated Move model", async () => {
    const moves = await requireDatabase().orm.public.Move
      .where({ fenBefore: null })
      .limit(1)
      .all();
    expect(moves).toBeInstanceOf(Array);
  }, 30_000);

  it("applies a rated resignation once and emits notifications once under concurrent finish attempts", async () => {
    const db = requireDatabase();
    const { game, whiteUser, blackUser } = await createRatedGameFixture();
    const notifications: number[] = [];
    const unsubscribe = subscribeToNotifications((notification) => {
      if (notification.userId === whiteUser.id || notification.userId === blackUser.id) {
        notifications.push(notification.userId);
      }
    });

    try {
      const attempts = await Promise.all([
        finishGame(game.id, {
          result: "WHITE_WIN",
          terminationReason: "RESIGNATION",
          whiteTimeRemainingMs: 300_000n,
          blackTimeRemainingMs: 300_000n,
        }),
        finishGame(game.id, {
          result: "WHITE_WIN",
          terminationReason: "RESIGNATION",
          whiteTimeRemainingMs: 300_000n,
          blackTimeRemainingMs: 300_000n,
        }),
      ]);

      expect(
        attempts.filter(Boolean),
        JSON.stringify({
          gameId: game.id,
          attempts: attempts.map((attempt) => Array.isArray(attempt)
            ? attempt.map((row) => ({ id: row.id, status: row.status }))
            : attempt && { id: attempt.id, status: attempt.status }),
        }),
      ).toHaveLength(1);
      expect(await finishGame(game.id, {
        result: "WHITE_WIN",
        terminationReason: "RESIGNATION",
        whiteTimeRemainingMs: 300_000n,
        blackTimeRemainingMs: 300_000n,
      })).toBeNull();

      const finalGame = await db.orm.public.Game.where({ id: game.id }).first();
      expect(finalGame).toMatchObject({
        status: "FINISHED",
        result: "WHITE_WIN",
        terminationReason: "RESIGNATION",
      });

      const histories = await db.orm.public.RatingHistory.where({ gameId: game.id }).all();
      expect(histories).toHaveLength(2);
      expect(histories.map((history) => history.result).sort()).toEqual([
        "BLACK_WIN",
        "WHITE_WIN",
      ]);

      const ratings = await Promise.all([
        db.orm.public.Rating.where({ userId: whiteUser.id, category: "BLITZ" }).first(),
        db.orm.public.Rating.where({ userId: blackUser.id, category: "BLITZ" }).first(),
      ]);
      expect(ratings.map((rating) => rating?.rating)).toEqual([1516, 1484]);
      expect(ratings.map((rating) => rating?.gamesPlayed)).toEqual([1, 1]);

      const persistedNotifications = await Promise.all([
        db.orm.public.Notification.where({ userId: whiteUser.id }).all(),
        db.orm.public.Notification.where({ userId: blackUser.id }).all(),
      ]);
      expect(persistedNotifications.map((rows) => rows.filter((row) =>
        row.type === "GAME_FINISHED"
      ).length)).toEqual([1, 1]);
      expect(notifications.sort()).toEqual([whiteUser.id, blackUser.id].sort());
    } finally {
      unsubscribe();
    }
  }, 30_000);

  it("runs accepted draws through the shared rating and notification effects", async () => {
    const db = requireDatabase();
    const { game, whiteUser, blackUser, white } = await createRatedGameFixture();
    await db.orm.public.Game.where({ id: game.id })
      .update({ drawOfferParticipantId: white.id });

    const finished = await resolveDrawOffer(
      game.id,
      white.id,
      true,
      280_000n,
      300_000n,
    );

    expect(finished).not.toBeNull();
    expect(await db.orm.public.RatingHistory.where({ gameId: game.id }).all()).toHaveLength(2);
    const notifications = await Promise.all([
      db.orm.public.Notification.where({ userId: whiteUser.id }).all(),
      db.orm.public.Notification.where({ userId: blackUser.id }).all(),
    ]);
    expect(notifications.map((rows) => rows.filter((row) =>
      row.type === "GAME_FINISHED"
    ).length)).toEqual([1, 1]);
  }, 30_000);

  it("runs timeouts through the shared rating and notification effects", async () => {
    const db = requireDatabase();
    const { game, whiteUser, blackUser } = await createRatedGameFixture();

    const finished = await finishGameOnTimeout(
      game.id,
      START_FEN,
      "WHITE",
      0n,
      300_000n,
    );

    expect(finished).not.toBeNull();
    expect(await db.orm.public.RatingHistory.where({ gameId: game.id }).all()).toHaveLength(2);
    const notifications = await Promise.all([
      db.orm.public.Notification.where({ userId: whiteUser.id }).all(),
      db.orm.public.Notification.where({ userId: blackUser.id }).all(),
    ]);
    expect(notifications.map((rows) => rows.filter((row) =>
      row.type === "GAME_FINISHED"
    ).length)).toEqual([1, 1]);
  }, 30_000);

  it("finishes a tournament no-show once and excludes it from ratings", async () => {
    const db = requireDatabase();
    const { game, whiteUser, blackUser, white, black } = await createRatedGameFixture();
    const startedAt = Temporal.Instant.fromEpochMilliseconds(
      Temporal.Now.instant().epochMilliseconds - 120_000,
    );
    await db.orm.public.Game.where({ id: game.id }).update({
      type: "TOURNAMENT",
      startedAt,
    });
    const notifications: number[] = [];
    const unsubscribe = subscribeToNotifications((notification) => {
      if (notification.userId === whiteUser.id || notification.userId === blackUser.id) {
        notifications.push(notification.userId);
      }
    });

    try {
      const claims = await Promise.all([
        claimGameNoShow(game.id, black.id, "WIN", startedAt),
        claimGameNoShow(game.id, black.id, "WIN", startedAt),
      ]);

      expect(claims.filter(Boolean)).toHaveLength(1);
      expect(await claimGameNoShow(game.id, black.id, "WIN", startedAt)).toBeNull();
      expect(await db.orm.public.Game.where({ id: game.id }).first()).toMatchObject({
        status: "FINISHED",
        result: "BLACK_WIN",
        terminationReason: "NO_SHOW",
      });
      expect(await db.orm.public.RatingHistory.where({ gameId: game.id }).all())
        .toHaveLength(0);
      expect(await db.orm.public.Rating.where({ userId: whiteUser.id }).all()).toHaveLength(0);
      expect(await db.orm.public.Rating.where({ userId: blackUser.id }).all()).toHaveLength(0);
      const persistedNotifications = await Promise.all([
        db.orm.public.Notification.where({ userId: whiteUser.id }).all(),
        db.orm.public.Notification.where({ userId: blackUser.id }).all(),
      ]);
      expect(persistedNotifications.map((rows) => rows.filter((row) =>
        row.type === "GAME_FINISHED"
      ).length)).toEqual([1, 1]);
      expect(notifications.sort()).toEqual([whiteUser.id, blackUser.id].sort());
    } finally {
      unsubscribe();
    }
  }, 30_000);

  it("applies rating and notifications when a legal checkmate move ends the game", async () => {
    const db = requireDatabase();
    const { game, whiteUser, blackUser, white, black } = await createRatedGameFixture();
    const chess = new Chess();
    const played: Array<{
      san: string;
      from: string;
      to: string;
      fenBefore: string;
      fenAfter: string;
      participantId: number;
    }> = [];
    for (const [san, participantId] of [
      ["f3", white.id],
      ["e5", black.id],
      ["g4", white.id],
    ] as const) {
      const fenBefore = chess.fen();
      const move = chess.move(san);
      played.push({
        san: move.san,
        from: move.from,
        to: move.to,
        fenBefore,
        fenAfter: chess.fen(),
        participantId,
      });
    }
    const now = Temporal.Now.instant();
    await db.orm.public.Game.where({ id: game.id }).update({
      currentFen: chess.fen(),
      activeColor: "BLACK",
      startedAt: now,
    });
    for (const [index, move] of played.entries()) {
      await db.orm.public.Move.create({
        gameId: game.id,
        participantId: move.participantId,
        ply: index + 1,
        moveNumber: Math.ceil((index + 1) / 2),
        san: move.san,
        from: move.from,
        to: move.to,
        promotion: null,
        fenBefore: move.fenBefore,
        fenAfter: move.fenAfter,
        playedAt: now,
      });
    }

    const notifications: number[] = [];
    const unsubscribe = subscribeToNotifications((notification) => {
      if (notification.userId === whiteUser.id || notification.userId === blackUser.id) {
        notifications.push(notification.userId);
      }
    });
    try {
      const result = await moveService.playMove(game.id, blackUser.id, {
        from: "d8",
        to: "h4",
      });

      if (!("move" in result)) throw new Error("Expected a persisted checkmate move.");
      expect(result.move).toMatchObject({ san: "Qh4#" });
      expect(await db.orm.public.Game.where({ id: game.id }).first()).toMatchObject({
        status: "FINISHED",
        result: "BLACK_WIN",
        terminationReason: "CHECKMATE",
      });
      expect(await db.orm.public.RatingHistory.where({ gameId: game.id }).all())
        .toHaveLength(2);
      const persistedNotifications = await Promise.all([
        db.orm.public.Notification.where({ userId: whiteUser.id }).all(),
        db.orm.public.Notification.where({ userId: blackUser.id }).all(),
      ]);
      expect(persistedNotifications.map((rows) => rows.filter((row) =>
        row.type === "GAME_FINISHED"
      ).length)).toEqual([1, 1]);
      expect(notifications.sort()).toEqual([whiteUser.id, blackUser.id].sort());
    } finally {
      unsubscribe();
    }
  }, 30_000);

  it("rolls back the finished game, ratings, and notifications when the surrounding transaction fails", async () => {
    const db = requireDatabase();
    const { game, whiteUser, blackUser, white, black } = await createRatedGameFixture();
    const forcedFailure = new Error("force integration transaction rollback");

    await expect(db.transaction(async (tx) => {
      await tx.orm.public.Game.where({ id: game.id, status: "IN_PROGRESS" }).update({
        status: "FINISHED",
        result: "WHITE_WIN",
        terminationReason: "RESIGNATION",
        endedAt: Temporal.Now.instant(),
        activeColor: null,
      });
      await finalizeGameFinishedEffects(tx, {
        id: game.id,
        type: "ONLINE",
        status: "FINISHED",
        isRated: true,
        ratingCategory: "BLITZ",
        result: "WHITE_WIN",
        tournamentRoundId: null,
      }, [
        { id: white.id, gameId: game.id, color: "WHITE", participantType: "USER", userId: whiteUser.id },
        { id: black.id, gameId: game.id, color: "BLACK", participantType: "USER", userId: blackUser.id },
      ]);
      throw forcedFailure;
    })).rejects.toThrow(forcedFailure);

    const rolledBackGame = await db.orm.public.Game.where({ id: game.id }).first();
    expect(rolledBackGame).toMatchObject({ status: "IN_PROGRESS", result: null });
    expect(await db.orm.public.RatingHistory.where({ gameId: game.id }).all()).toHaveLength(0);
    const rows = await Promise.all([
      db.orm.public.Rating.where({ userId: whiteUser.id, category: "BLITZ" }).all(),
      db.orm.public.Rating.where({ userId: blackUser.id, category: "BLITZ" }).all(),
      db.orm.public.Notification.where({ userId: whiteUser.id }).all(),
      db.orm.public.Notification.where({ userId: blackUser.id }).all(),
    ]);
    expect(rows.map((result) => result.length)).toEqual([0, 0, 0, 0]);
  }, 30_000);

  it("enforces tournament capacity for concurrent registrations", async () => {
    const db = requireDatabase();
    const { players, tournament } = await createTournamentFixture(2, false, 3);

    const results = await Promise.all(players.map((player) =>
      registerTournamentUser(tournament.id, player.id, player.username)
    ));

    expect(results.filter((result) => result.kind === "registered")).toHaveLength(2);
    expect(results.filter((result) => result.kind === "full")).toHaveLength(1);
    const participants = await db.orm.public.TournamentParticipant
      .where({ tournamentId: tournament.id })
      .all();
    expect(participants).toHaveLength(2);
    expect(new Set(participants.map((participant) => participant.userId)).size).toBe(2);
  }, 30_000);

  it("applies tournament ratings once when the final round is finalized concurrently", async () => {
    const db = requireDatabase();
    const { organizer, players, tournament } = await createTournamentFixture(2, true);
    await db.orm.public.Tournament.where({ id: tournament.id })
      .update({ status: "IN_PROGRESS" });

    const tournamentParticipants = await Promise.all(players.map((player, index) =>
      db.orm.public.TournamentParticipant.create({
        tournamentId: tournament.id,
        userId: player.id,
        participantType: "USER",
        displayName: player.username,
        accessTokenHash: null,
        invitationLinkId: null,
        status: "ACTIVE",
        seed: index + 1,
        score: "0",
        wins: 0,
        draws: 0,
        losses: 0,
        joinedAt: Temporal.Now.instant(),
        leftAt: null,
        eliminatedAt: null,
      })
    ));
    const now = Temporal.Now.instant();
    const round = await db.orm.public.TournamentRound.create({
      tournamentId: tournament.id,
      roundNumber: 1,
      status: "IN_PROGRESS",
      startsAt: now,
      endsAt: null,
    });
    const game = await db.orm.public.Game.create({
      type: "TOURNAMENT",
      status: "FINISHED",
      result: "WHITE_WIN",
      terminationReason: "CHECKMATE",
      isRated: true,
      ratingCategory: "RAPID",
      initialTimeSeconds: 600,
      incrementSeconds: 0,
      whiteTimeRemainingMs: 600_000n,
      blackTimeRemainingMs: 600_000n,
      activeColor: null,
      clockStartedAt: null,
      currentFen: START_FEN,
      startedAt: now,
      endedAt: now,
      lastActivityAt: now,
      lastMoveAt: now,
      challengeId: null,
      tournamentRoundId: round.id,
      drawOfferParticipantId: null,
      pendingUndoParticipantId: null,
    });
    createdGameIds.push(game.id);

    await Promise.all(tournamentParticipants.map((participant, index) =>
      db.orm.public.GameParticipant.create({
        gameId: game.id,
        participantType: "USER",
        color: index === 0 ? "WHITE" : "BLACK",
        userId: players[index].id,
        tournamentParticipantId: participant.id,
        displayName: players[index].username,
      })
    ));

    const finalize = () => advanceTournamentRound(
      tournament.id,
      organizer.id,
      1,
      { initialTimeSeconds: 600, incrementSeconds: 0, pairings: [] },
      true,
      [],
    );
    await Promise.all([finalize(), finalize()]);
    const retry = await finalize();

    expect(retry).toBeNull();
    expect(await db.orm.public.Tournament.where({ id: tournament.id }).first())
      .toMatchObject({ status: "FINISHED" });
    expect(await db.orm.public.TournamentRound.where({ id: round.id }).first())
      .toMatchObject({ status: "FINISHED" });
    expect(await db.orm.public.TournamentParticipant.where({ tournamentId: tournament.id }).all())
      .toMatchObject([{ status: "FINISHED" }, { status: "FINISHED" }]);
    expect(await db.orm.public.RatingHistory.where({ gameId: game.id }).all())
      .toHaveLength(2);
    const ratings = await Promise.all(players.map((player) =>
      db.orm.public.Rating.where({ userId: player.id, category: "RAPID" }).first()
    ));
    expect(ratings.map((rating) => ({
      rating: rating?.rating,
      gamesPlayed: rating?.gamesPlayed,
      wins: rating?.wins,
      losses: rating?.losses,
    }))).toEqual([
      { rating: 1516, gamesPlayed: 1, wins: 1, losses: 0 },
      { rating: 1484, gamesPlayed: 1, wins: 0, losses: 1 },
    ]);
  }, 30_000);

  it("starts a tournament over HTTP, completes its game over Socket.IO, and finalizes its rating", async () => {
    const db = requireDatabase();
    const { organizer, players, tournament } = await createTournamentFixture(2, true);
    const now = Temporal.Now.instant();
    const past = (offsetMs: number) =>
      Temporal.Instant.fromEpochMilliseconds(now.epochMilliseconds + offsetMs);
    await db.orm.public.Tournament.where({ id: tournament.id }).update({
      status: "REGISTRATION_CLOSED",
      registrationStartsAt: past(-7_200_000),
      registrationEndsAt: past(-3_600_000),
      startsAt: past(-60_000),
    });
    const participants = await Promise.all(players.map((player, index) =>
      db.orm.public.TournamentParticipant.create({
        tournamentId: tournament.id,
        userId: player.id,
        participantType: "USER",
        displayName: player.username,
        accessTokenHash: null,
        invitationLinkId: null,
        status: "REGISTERED",
        seed: index + 1,
        score: "0",
        wins: 0,
        draws: 0,
        losses: 0,
        joinedAt: now,
        leftAt: null,
        eliminatedAt: null,
      })
    ));

    const secret = `integration-${randomUUID()}`;
    process.env.JWT_ACCESS_SECRET = secret;
    const createAccessToken = async (user: typeof organizer) => {
      const session = await db.orm.public.Session.create({
        userId: user.id,
        expiresAt: past(3_600_000),
      });
      return jwt.sign({
        id: user.id,
        email: user.email,
        role: user.role,
        type: "access",
        sessionId: session.id,
      }, secret, { expiresIn: "1h" });
    };
    const [organizerToken, ...playerTokens] = await Promise.all([
      createAccessToken(organizer),
      ...players.map(createAccessToken),
    ]);

    const app = express();
    app.use(express.json());
    const [{ default: tournamentsRouter }, { errorHandler }, { attachGameGateway }] =
      await Promise.all([
        import("../routes/tournaments"),
        import("../middlewares/error.middleware"),
        import("../websocket/game.gateway"),
      ]);
    app.use("/api/tournaments", tournamentsRouter);
    app.use(errorHandler);
    const server = createServer(app);
    const io = attachGameGateway(server);
    const sockets: Socket[] = [];

    try {
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
      });
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Impossible de déterminer le port du serveur d'intégration.");
      }
      const baseUrl = `http://127.0.0.1:${address.port}`;

      const startResponse = await fetch(
        `${baseUrl}/api/tournaments/${tournament.id}/start`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${organizerToken}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ initialTimeSeconds: 0, incrementSeconds: 0 }),
        },
      );
      expect(startResponse.status).toBe(201);
      const startPayload = await startResponse.json() as {
        games: Array<{
          game: { id: number };
          participants: Array<{ color: string; userId: number | null }>;
        }>;
      };
      const gameId = startPayload.games[0]?.game.id;
      if (!gameId) throw new Error("La création de la première ronde n'a pas retourné de partie.");
      createdGameIds.push(gameId);
      expect(startPayload.games).toHaveLength(1);

      const connectPlayer = async (token: string) => {
        const socket = createSocketClient(baseUrl, {
          auth: { accessToken: token },
          forceNew: true,
          reconnection: false,
        });
        sockets.push(socket);
        await new Promise<void>((resolve, reject) => {
          socket.once("connect", resolve);
          socket.once("connect_error", reject);
        });
        const state = new Promise<unknown>((resolve) =>
          socket.once(GAME_EVENTS.STATE, resolve)
        );
        const acknowledgement = new Promise<{ success: boolean }>((resolve) => {
          socket.emit(CONNECTION_EVENTS.JOIN_GAME, { gameId }, resolve);
        });
        await expect(acknowledgement).resolves.toMatchObject({ success: true });
        await state;
        return socket;
      };
      const connectedPlayers = await Promise.all(playerTokens.map(connectPlayer));
      const gameParticipants = startPayload.games[0]!.participants;
      const whiteUserId = gameParticipants.find((participant) =>
        participant.color === "WHITE"
      )?.userId;
      const blackUserId = gameParticipants.find((participant) =>
        participant.color === "BLACK"
      )?.userId;
      const whiteIndex = players.findIndex((player) => player.id === whiteUserId);
      const blackIndex = players.findIndex((player) => player.id === blackUserId);
      if (whiteIndex < 0 || blackIndex < 0) {
        throw new Error("L'appariement ne correspond pas aux comptes inscrits.");
      }
      const whiteSocket = connectedPlayers[whiteIndex]!;
      const blackSocket = connectedPlayers[blackIndex]!;
      const play = (socket: Socket, from: string, to: string) =>
        new Promise<{ success: boolean; data?: { game?: { status?: string; result?: string } } }>(
          (resolve) => socket.emit(MOVE_EVENTS.PLAY, { gameId, from, to }, resolve),
        );

      for (const [socket, from, to] of [
        [whiteSocket, "f2", "f3"],
        [blackSocket, "e7", "e5"],
        [whiteSocket, "g2", "g4"],
      ] as const) {
        await expect(play(socket, from, to)).resolves.toMatchObject({ success: true });
      }
      const checkmate = await play(blackSocket, "d8", "h4");
      expect(checkmate).toMatchObject({
        success: true,
        data: { game: { status: "FINISHED", result: "BLACK_WIN" } },
      });

      const advanceResponse = await fetch(
        `${baseUrl}/api/tournaments/${tournament.id}/rounds/next`,
        {
          method: "POST",
          headers: { authorization: `Bearer ${organizerToken}` },
        },
      );
      expect(advanceResponse.status).toBe(200);
      expect(await advanceResponse.json()).toMatchObject({ finished: true });
      expect(await db.orm.public.Tournament.where({ id: tournament.id }).first())
        .toMatchObject({ status: "FINISHED" });
      expect(await db.orm.public.RatingHistory.where({ gameId }).all()).toHaveLength(2);
      const ratings = await Promise.all(players.map((player) =>
        db.orm.public.Rating.where({ userId: player.id, category: "RAPID" }).first()
      ));
      expect(ratings.map((rating) => ({
        rating: rating?.rating,
        gamesPlayed: rating?.gamesPlayed,
        wins: rating?.wins,
        losses: rating?.losses,
      }))).toEqual([
        { rating: 1484, gamesPlayed: 1, wins: 0, losses: 1 },
        { rating: 1516, gamesPlayed: 1, wins: 1, losses: 0 },
      ]);
    } finally {
      for (const socket of sockets) socket.close();
      await new Promise<void>((resolve) => io.close(() => resolve()));
      process.env.JWT_ACCESS_SECRET = originalAccessSecret;
    }
  }, 60_000);
});
