import dotenv from "dotenv";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { Temporal } from "temporal-polyfill";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
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
let database: typeof import("./db.ts")["db"] | undefined;
let closeDatabase: (() => Promise<void>) | undefined;
let finishGame: typeof import("../repository/game-action.repository")["finishGame"];
let finishGameOnTimeout: typeof import("../repository/game-action.repository")["finishGameOnTimeout"];
let resolveDrawOffer: typeof import("../repository/game-action.repository")["resolveDrawOffer"];
let finalizeGameFinishedEffects: typeof import("../service/gameFinishedEffects")["finalizeGameFinishedEffects"];
const createdGameIds: number[] = [];
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
    ({ finishGame, finishGameOnTimeout, resolveDrawOffer } =
      await import("../repository/game-action.repository"));
    ({ finalizeGameFinishedEffects } = await import("../service/gameFinishedEffects"));
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
});
