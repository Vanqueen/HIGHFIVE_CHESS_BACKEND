import "../config/environment.ts";
import postgres from "@prisma/orm-postgres/runtime";
import { Pool } from "pg";

import "temporal-polyfill/global";

import type { Contract } from "./contract.d.ts";
import contractJson from "./contract.json" with { type: "json" };

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not defined");
}

export const db = postgres<Contract>({
  contractJson,
  url: process.env.DATABASE_URL,
});

const pgPool = new Pool({ connectionString: process.env.DATABASE_URL });

let connection: Promise<void> | undefined;

async function ensureGameStatisticsSchema() {
  const statements = [
    `
      CREATE TABLE IF NOT EXISTS "public"."GamePlayerStatistic" (
        "id" SERIAL PRIMARY KEY,
        "gameId" int4 NOT NULL,
        "userId" int4 NOT NULL,
        "color" text NOT NULL CHECK ("color" IN ('WHITE', 'BLACK')),
        "outcome" text NOT NULL CHECK ("outcome" IN ('WIN', 'LOSS', 'DRAW')),
        "gameType" text NOT NULL CHECK ("gameType" IN ('LOCAL', 'ONLINE', 'AI', 'CHALLENGE', 'TOURNAMENT')),
        "createdAt" timestamptz NOT NULL DEFAULT NOW()
      );
    `,
    `
      CREATE TABLE IF NOT EXISTS "public"."UserStatistics" (
        "userId" int4 PRIMARY KEY,
        "gamesPlayed" int4 NOT NULL DEFAULT 0,
        "wins" int4 NOT NULL DEFAULT 0,
        "losses" int4 NOT NULL DEFAULT 0,
        "draws" int4 NOT NULL DEFAULT 0,
        "updatedAt" timestamptz NOT NULL DEFAULT NOW()
      );
    `,
    `
      CREATE TABLE IF NOT EXISTS "public"."GuestNotification" (
        "id" SERIAL PRIMARY KEY,
        "guestParticipantId" int4 NOT NULL,
        "type" text NOT NULL CHECK ("type" IN ('FRIEND_REQUEST', 'FRIEND_REQUEST_ACCEPTED', 'CHALLENGE_RECEIVED', 'CHALLENGE_ACCEPTED', 'GAME_STARTED', 'GAME_FINISHED', 'GAME_YOUR_TURN', 'TOURNAMENT_INVITATION', 'TOURNAMENT_STARTED', 'TOURNAMENT_ROUND_STARTED', 'TOURNAMENT_ROUND_FINISHED', 'SYSTEM')),
        "title" text NOT NULL,
        "content" text NOT NULL,
        "data" json,
        "createdAt" timestamptz NOT NULL DEFAULT NOW(),
        "readAt" timestamptz,
        "expiresAt" timestamptz
      );
    `,
    `
      CREATE UNIQUE INDEX IF NOT EXISTS "GamePlayerStatistic_gameId_userId_key"
      ON "public"."GamePlayerStatistic" ("gameId", "userId");
    `,
    `
      CREATE INDEX IF NOT EXISTS "GamePlayerStatistic_gameId_idx"
      ON "public"."GamePlayerStatistic" ("gameId");
    `,
    `
      CREATE INDEX IF NOT EXISTS "GamePlayerStatistic_userId_createdAt_idx"
      ON "public"."GamePlayerStatistic" ("userId", "createdAt");
    `,
    `
      CREATE INDEX IF NOT EXISTS "GamePlayerStatistic_userId_idx"
      ON "public"."GamePlayerStatistic" ("userId");
    `,
    `
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint c
          JOIN pg_class t ON c.conrelid = t.oid
          JOIN pg_namespace n ON n.oid = t.relnamespace
          WHERE c.conname = 'GamePlayerStatistic_gameId_fkey'
            AND n.nspname = 'public'
            AND t.relname = 'GamePlayerStatistic'
        ) THEN
          ALTER TABLE "public"."GamePlayerStatistic"
          ADD CONSTRAINT "GamePlayerStatistic_gameId_fkey"
          FOREIGN KEY ("gameId") REFERENCES "public"."Game" ("id") ON DELETE CASCADE;
        END IF;

        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint c
          JOIN pg_class t ON c.conrelid = t.oid
          JOIN pg_namespace n ON n.oid = t.relnamespace
          WHERE c.conname = 'GamePlayerStatistic_userId_fkey'
            AND n.nspname = 'public'
            AND t.relname = 'GamePlayerStatistic'
        ) THEN
          ALTER TABLE "public"."GamePlayerStatistic"
          ADD CONSTRAINT "GamePlayerStatistic_userId_fkey"
          FOREIGN KEY ("userId") REFERENCES "public"."User" ("id") ON DELETE CASCADE;
        END IF;

        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint c
          JOIN pg_class t ON c.conrelid = t.oid
          JOIN pg_namespace n ON n.oid = t.relnamespace
          WHERE c.conname = 'UserStatistics_userId_fkey'
            AND n.nspname = 'public'
            AND t.relname = 'UserStatistics'
        ) THEN
          ALTER TABLE "public"."UserStatistics"
          ADD CONSTRAINT "UserStatistics_userId_fkey"
          FOREIGN KEY ("userId") REFERENCES "public"."User" ("id") ON DELETE CASCADE;
        END IF;
      END $$;
    `,
  ];

  for (const statement of statements) {
    await pgPool.query(statement);
  }
}

export function connectDatabase(): Promise<void> {
  if (!connection) {
    console.info("[database] Connexion à PostgreSQL...");
    connection = db.connect()
      .then(async () => {
        await ensureGameStatisticsSchema();
        console.info("[database] Connexion PostgreSQL établie.");
      })
      .catch((error: unknown) => {
        connection = undefined;
        console.error("[database] Échec de la connexion PostgreSQL.", error);
        throw error;
      });
  }

  return connection;
}
