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
const testEnvPath = resolve(process.cwd(), ".env.test");
const testEnvironment = existsSync(testEnvPath)
  ? dotenv.parse(readFileSync(testEnvPath))
  : {};
const testDatabaseUrl = inheritedEnvironment.TEST_DATABASE_URL?.trim() ||
  testEnvironment.TEST_DATABASE_URL?.trim();
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
let expireDueChallenges: typeof import("../service/challengeService")["ChallengeService"]["expireDueChallenges"];
let registerTournamentUser: typeof import("../repository/tournament.repository")["registerTournamentUser"];
let advanceTournamentRound: typeof import("../repository/tournament.repository")["advanceTournamentRound"];
const createdGameIds: number[] = [];
const createdTournamentIds: number[] = [];
const createdUserIds: number[] = [];
const createdReportIds: number[] = [];
const createdAchievementIds: number[] = [];
const createdSessionIds: number[] = [];

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function requireDatabase() {
  if (!database) throw new Error("PostgreSQL integration database is not connected.");
  return database;
}

async function createIntegrationToken(user: {
  id: number;
  email: string;
  role: "USER" | "ORGANIZER" | "ADMIN";
}) {
  const db = requireDatabase();
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) throw new Error("JWT_ACCESS_SECRET is not configured for integration tests.");
  const expiresAt = Temporal.Instant.fromEpochMilliseconds(Date.now() + 3_600_000);
  const session = await db.orm.public.Session.create({ userId: user.id, expiresAt });
  createdSessionIds.push(session.id);
  return jwt.sign({
    id: user.id,
    email: user.email,
    role: user.role,
    type: "access",
    sessionId: session.id,
  }, secret, { expiresIn: "1h" });
}

async function startIntegrationApi() {
  const app = express();
  app.use(express.json());
  const [{ default: reportsRouter }, { default: usersRouter }, { errorHandler }] =
    await Promise.all([
      import("../routes/reports"),
      import("../routes/users"),
      import("../middlewares/error.middleware"),
    ]);
  app.use("/api/reports", reportsRouter);
  app.use("/api/users", usersRouter);
  app.use(errorHandler);

  const server = createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    throw new Error("Impossible de démarrer le serveur HTTP d'intégration.");
  }
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    }),
  };
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
  for (const sessionId of createdSessionIds) {
    await db.orm.public.Session.where({ id: sessionId }).delete();
  }
  createdSessionIds.length = 0;
  for (const reportId of createdReportIds) {
    await db.orm.public.Report.where({ id: reportId }).delete();
  }
  createdReportIds.length = 0;
  for (const achievementId of createdAchievementIds) {
    await db.orm.public.UserAchievement.where({ achievementId }).delete();
    await db.orm.public.Achievement.where({ id: achievementId }).delete();
  }
  createdAchievementIds.length = 0;
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
    ({ ChallengeService: { expireDueChallenges } } =
      await import("../service/challengeService"));
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

  it("persists, lists and reviews reports against PostgreSQL", async () => {
    const db = requireDatabase();
    const suffix = randomUUID();
    const reporter = await db.orm.public.User.create({
      username: `it-reporter-${suffix}`,
      email: `it-reporter-${suffix}@example.test`,
      passwordHash: "integration-test-only",
    });
    createdUserIds.push(reporter.id);
    const reportedUser = await db.orm.public.User.create({
      username: `it-reported-${suffix}`,
      email: `it-reported-${suffix}@example.test`,
      passwordHash: "integration-test-only",
    });
    createdUserIds.push(reportedUser.id);
    const admin = await db.orm.public.User.create({
      username: `it-reviewer-${suffix}`,
      email: `it-reviewer-${suffix}@example.test`,
      passwordHash: "integration-test-only",
      role: "ADMIN",
    });
    createdUserIds.push(admin.id);

    process.env.JWT_ACCESS_SECRET = `integration-${randomUUID()}`;
    const [reporterToken, adminToken] = await Promise.all([
      createIntegrationToken(reporter),
      createIntegrationToken(admin),
    ]);
    const api = await startIntegrationApi();
    try {
      const createResponse = await fetch(`${api.baseUrl}/api/reports`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${reporterToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          reportedUserId: reportedUser.id,
          reason: "OTHER",
          description: "PostgreSQL route integration test",
        }),
      });
      expect(createResponse.status).toBe(201);
      const report = await createResponse.json() as { id: number };
      createdReportIds.push(report.id);

      const mineResponse = await fetch(`${api.baseUrl}/api/reports/me`, {
        headers: { authorization: `Bearer ${reporterToken}` },
      });
      expect(mineResponse.status).toBe(200);
      expect(await mineResponse.json()).toContainEqual(
        expect.objectContaining({ id: report.id, status: "PENDING" }),
      );

      const deniedQueueResponse = await fetch(`${api.baseUrl}/api/reports/`);
      expect(deniedQueueResponse.status).toBe(401);
      const forbiddenQueueResponse = await fetch(`${api.baseUrl}/api/reports/`, {
        headers: { authorization: `Bearer ${reporterToken}` },
      });
      expect(forbiddenQueueResponse.status).toBe(403);
      const queueResponse = await fetch(`${api.baseUrl}/api/reports/?status=PENDING`, {
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(queueResponse.status).toBe(200);
      expect(await queueResponse.json()).toContainEqual(
        expect.objectContaining({ id: report.id, reporterId: reporter.id }),
      );

      const reviewResponse = await fetch(`${api.baseUrl}/api/reports/${report.id}`, {
        method: "PATCH",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          status: "RESOLVED",
          resolutionNote: "Reviewed in route integration test",
        }),
      });
      expect(reviewResponse.status).toBe(200);
      await expect(db.orm.public.Report.where({ id: report.id }).first()).resolves.toMatchObject({
        status: "RESOLVED",
        reviewedById: admin.id,
        resolutionNote: "Reviewed in route integration test",
      });
    } finally {
      await api.close();
    }
  }, 30_000);

  it("serves persisted achievements through the authenticated user route", async () => {
    const db = requireDatabase();
    const suffix = randomUUID();
    const user = await db.orm.public.User.create({
      username: `it-achievement-api-${suffix}`,
      email: `it-achievement-api-${suffix}@example.test`,
      passwordHash: "integration-test-only",
    });
    createdUserIds.push(user.id);
    const achievement = await db.orm.public.Achievement.create({
      code: `IT_API_ACHIEVEMENT_${suffix}`,
      name: "API integration",
      description: "Achievement returned by the authenticated HTTP endpoint.",
      category: "GAMES",
      requirementType: "GAMES_PLAYED",
      requirementValue: 1,
      isActive: true,
    });
    createdAchievementIds.push(achievement.id);
    await db.orm.public.UserAchievement.create({
      userId: user.id,
      achievementId: achievement.id,
      progress: 1,
      unlockedAt: Temporal.Now.instant(),
    });
    process.env.JWT_ACCESS_SECRET = `integration-${randomUUID()}`;
    const token = await createIntegrationToken(user);
    const api = await startIntegrationApi();
    try {
      const response = await fetch(`${api.baseUrl}/api/users/me/achievements`, {
        headers: { authorization: `Bearer ${token}` },
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toContainEqual(
        expect.objectContaining({
          userId: user.id,
          achievementId: achievement.id,
          progress: 1,
          achievement: expect.objectContaining({ code: achievement.code }),
        }),
      );
    } finally {
      await api.close();
    }
  }, 30_000);

  it("updates achievements transactionally and idempotently in PostgreSQL", async () => {
    const db = requireDatabase();
    const { updateUserAchievements } = await import("../service/achievementService");
    const suffix = randomUUID();
    const user = await db.orm.public.User.create({
      username: `it-achievement-${suffix}`,
      email: `it-achievement-${suffix}@example.test`,
      passwordHash: "integration-test-only",
    });
    createdUserIds.push(user.id);
    const achievement = await db.orm.public.Achievement.create({
      code: `IT_WINS_${suffix}`,
      name: "Integration win",
      description: "Achievement used by the PostgreSQL integration test.",
      category: "WINS",
      requirementType: "WINS",
      requirementValue: 1,
      isActive: true,
    });
    createdAchievementIds.push(achievement.id);
    await db.orm.public.UserStatistics.create({
      userId: user.id,
      gamesPlayed: 0,
      wins: 0,
      losses: 0,
      draws: 0,
    });

    await db.transaction((tx) => updateUserAchievements(tx, user.id));
    const lockedProgress = await db.orm.public.UserAchievement
      .where({ userId: user.id, achievementId: achievement.id })
      .first();
    expect(lockedProgress).toMatchObject({ progress: 0, unlockedAt: null });

    await db.orm.public.UserStatistics.where({ userId: user.id })
      .update({ gamesPlayed: 1, wins: 1 });
    await db.transaction((tx) => updateUserAchievements(tx, user.id));
    const unlockedProgress = await db.orm.public.UserAchievement
      .where({ userId: user.id, achievementId: achievement.id })
      .first();
    expect(unlockedProgress).toMatchObject({ progress: 1 });
    expect(unlockedProgress?.unlockedAt).not.toBeNull();

    await db.orm.public.UserStatistics.where({ userId: user.id }).update({ wins: 0 });
    await db.transaction((tx) => updateUserAchievements(tx, user.id));
    const repeatedProgress = await db.orm.public.UserAchievement
      .where({ userId: user.id, achievementId: achievement.id })
      .all();
    expect(repeatedProgress).toHaveLength(1);
    expect(repeatedProgress[0].progress).toBe(1);
    expect(repeatedProgress[0].unlockedAt).toEqual(unlockedProgress?.unlockedAt);
  }, 30_000);

  it("updates social achievements when a PostgreSQL friendship is accepted", async () => {
    const db = requireDatabase();
    const { acceptFriendshipRequest } = await import("../repository/friendship.repository");
    const suffix = randomUUID();
    const requester = await db.orm.public.User.create({
      username: `it-friend-requester-${suffix}`,
      email: `it-friend-requester-${suffix}@example.test`,
      passwordHash: "integration-test-only",
    });
    createdUserIds.push(requester.id);
    const addressee = await db.orm.public.User.create({
      username: `it-friend-addressee-${suffix}`,
      email: `it-friend-addressee-${suffix}@example.test`,
      passwordHash: "integration-test-only",
    });
    createdUserIds.push(addressee.id);
    const achievement = await db.orm.public.Achievement.create({
      code: `IT_FRIEND_${suffix}`,
      name: "Integration friendship",
      description: "Achievement unlocked when an integration friendship is accepted.",
      category: "SOCIAL",
      requirementType: "FRIENDS_COUNT",
      requirementValue: 1,
      isActive: true,
    });
    createdAchievementIds.push(achievement.id);
    const friendship = await db.orm.public.Friendship.create({
      requesterId: requester.id,
      addresseeId: addressee.id,
      status: "PENDING",
      respondedAt: null,
    });

    await expect(acceptFriendshipRequest(friendship.id, addressee.id))
      .resolves.toMatchObject({ friendship: { status: "ACCEPTED" } });
    const progress = await Promise.all([requester.id, addressee.id].map((userId) =>
      db.orm.public.UserAchievement.where({ userId, achievementId: achievement.id }).first()
    ));
    expect(progress.map((row) => ({
      progress: row?.progress,
      unlocked: row?.unlockedAt !== null && row?.unlockedAt !== undefined,
    }))).toEqual([
      { progress: 1, unlocked: true },
      { progress: 1, unlocked: true },
    ]);
  }, 30_000);

  it("applies a rated resignation once and emits notifications once under concurrent finish attempts", async () => {
    const db = requireDatabase();
    const { game, whiteUser, blackUser, white, black } = await createRatedGameFixture();
    const achievement = await db.orm.public.Achievement.create({
      code: `IT_GAME_WIN_${randomUUID()}`,
      name: "Integration game win",
      description: "Achievement unlocked by the PostgreSQL game-finished test.",
      category: "WINS",
      requirementType: "WINS",
      requirementValue: 1,
      isActive: true,
    });
    createdAchievementIds.push(achievement.id);
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

      const statistics = await Promise.all([
        db.orm.public.UserStatistics.where({ userId: whiteUser.id }).first(),
        db.orm.public.UserStatistics.where({ userId: blackUser.id }).first(),
      ]);
      expect(statistics.map((row) => row && ({
        gamesPlayed: row.gamesPlayed,
        wins: row.wins,
        losses: row.losses,
        draws: row.draws,
      }))).toEqual([
        { gamesPlayed: 1, wins: 1, losses: 0, draws: 0 },
        { gamesPlayed: 1, wins: 0, losses: 1, draws: 0 },
      ]);
      expect(await db.orm.public.GamePlayerStatistic.where({ gameId: game.id }).all())
        .toHaveLength(2);
      const achievements = await Promise.all([
        db.orm.public.UserAchievement.where({
          userId: whiteUser.id,
          achievementId: achievement.id,
        }).first(),
        db.orm.public.UserAchievement.where({
          userId: blackUser.id,
          achievementId: achievement.id,
        }).first(),
      ]);
      expect(achievements.map((progress) => ({
        progress: progress?.progress,
        unlocked: progress?.unlockedAt !== null && progress?.unlockedAt !== undefined,
      }))).toEqual([
        { progress: 1, unlocked: true },
        { progress: 0, unlocked: false },
      ]);

      await db.transaction((tx) => finalizeGameFinishedEffects(tx, {
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
      ]));
      expect((await Promise.all([
        db.orm.public.UserStatistics.where({ userId: whiteUser.id }).first(),
        db.orm.public.UserStatistics.where({ userId: blackUser.id }).first(),
      ])).map((row) => row?.gamesPlayed)).toEqual([1, 1]);
      expect(await db.orm.public.GamePlayerStatistic.where({ gameId: game.id }).all())
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

  it("persists game-finished notifications for guests and exposes them by participant", async () => {
    const db = requireDatabase();
    const { game, whiteUser, black } = await createRatedGameFixture();
    await db.orm.public.GameParticipant.where({ id: black.id }).delete();
    const guest = await db.orm.public.GameParticipant.create({
      gameId: game.id,
      participantType: "GUEST",
      color: "BLACK",
      userId: null,
      tournamentParticipantId: null,
      displayName: "Invité noir",
    });

    const guestBroadcasts: number[] = [];
    const unsubscribe = subscribeToNotifications((notification) => {
      if (notification.guestParticipantId !== null) {
        guestBroadcasts.push(notification.guestParticipantId);
      }
    });
    try {
      await finishGame(game.id, {
        result: "WHITE_WIN",
        terminationReason: "RESIGNATION",
        whiteTimeRemainingMs: 300_000n,
        blackTimeRemainingMs: 300_000n,
      });

      const { NotificationService } = await import("../service/notificationService");
      const guestNotifications = await NotificationService.getForGuest(guest.id);
      expect(guestNotifications).toMatchObject([
        {
          guestParticipantId: guest.id,
          type: "GAME_FINISHED",
        },
      ]);
      expect(guestBroadcasts).toEqual([guest.id]);
      expect(await db.orm.public.UserStatistics.where({ userId: whiteUser.id }).first())
        .toMatchObject({ gamesPlayed: 1, wins: 1, losses: 0, draws: 0 });
    } finally {
      unsubscribe();
    }
  }, 30_000);

  it("expires due challenges once and atomically persists notifications and game state", async () => {
    const db = requireDatabase();
    const { game, whiteUser, blackUser } = await createRatedGameFixture();
    const challenge = await db.orm.public.Challenge.create({
      creatorId: whiteUser.id,
      invitedUserId: blackUser.id,
      status: "PENDING",
      expiresAt: Temporal.Instant.fromEpochMilliseconds(
        Temporal.Now.instant().epochMilliseconds - 60_000,
      ),
    });
    await db.orm.public.Game.where({ id: game.id }).update({
      type: "CHALLENGE",
      status: "WAITING",
      isRated: false,
      ratingCategory: null,
      activeColor: null,
      clockStartedAt: null,
      startedAt: null,
      challengeId: challenge.id,
    });

    const broadcasts: number[] = [];
    const unsubscribe = subscribeToNotifications((notification) => {
      if (notification.userId !== null) broadcasts.push(notification.userId);
    });
    try {
      const expirationCounts = await Promise.all([
        expireDueChallenges(),
        expireDueChallenges(),
      ]);
      expect(expirationCounts.reduce((sum, count) => sum + count, 0)).toBe(1);
      expect(await db.orm.public.Challenge.where({ id: challenge.id }).first())
        .toMatchObject({ status: "EXPIRED" });
      expect(await db.orm.public.Game.where({ id: game.id }).first())
        .toMatchObject({ status: "CANCELLED", terminationReason: "CANCELLED" });

      const persisted = await Promise.all([
        db.orm.public.Notification.where({
          userId: whiteUser.id,
          type: "SYSTEM",
        }).all(),
        db.orm.public.Notification.where({
          userId: blackUser.id,
          type: "SYSTEM",
        }).all(),
      ]);
      expect(persisted.map((rows) => rows.length)).toEqual([1, 1]);
      expect(broadcasts.sort()).toEqual([whiteUser.id, blackUser.id].sort());
    } finally {
      unsubscribe();
    }
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
    expect(await db.orm.public.UserStatistics.where({ userId: whiteUser.id }).first())
      .toBeNull();
    expect(await db.orm.public.UserStatistics.where({ userId: blackUser.id }).first())
      .toBeNull();
    expect(await db.orm.public.GamePlayerStatistic.where({ gameId: game.id }).all())
      .toHaveLength(0);
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
    const tournamentAchievement = await db.orm.public.Achievement.create({
      code: `IT_TOURNAMENT_PLAYED_${randomUUID()}`,
      name: "Integration tournament",
      description: "Achievement unlocked when an integration tournament is finished.",
      category: "TOURNAMENT",
      requirementType: "TOURNAMENTS_PLAYED",
      requirementValue: 1,
      isActive: true,
    });
    createdAchievementIds.push(tournamentAchievement.id);
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
    const tournamentProgress = await Promise.all(players.map((player) =>
      db.orm.public.UserAchievement.where({
        userId: player.id,
        achievementId: tournamentAchievement.id,
      }).first()
    ));
    expect(tournamentProgress.map((progress) => ({
      progress: progress?.progress,
      unlocked: progress?.unlockedAt !== null && progress?.unlockedAt !== undefined,
    }))).toEqual([
      { progress: 1, unlocked: true },
      { progress: 1, unlocked: true },
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
