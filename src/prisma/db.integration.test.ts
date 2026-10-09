import { afterAll, describe, expect, it } from "vitest";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
let closeDatabase: (() => Promise<void>) | undefined;

afterAll(async () => {
  await closeDatabase?.();
});

describe("PostgreSQL integration", () => {
  it.skipIf(!testDatabaseUrl)(
    "connects to the explicitly configured test database and reads the migrated Move model",
    async () => {
      const originalDatabaseUrl = process.env.DATABASE_URL;
      process.env.DATABASE_URL = testDatabaseUrl;
      try {
        const { connectDatabase, db } = await import("./db.ts");
        closeDatabase = () => db.close();
        await connectDatabase();
        const moves = await db.orm.public.Move
          .where({ fenBefore: null })
          .limit(1)
          .all();
        expect(moves).toBeInstanceOf(Array);
      } finally {
        if (originalDatabaseUrl === undefined) {
          delete process.env.DATABASE_URL;
        } else {
          process.env.DATABASE_URL = originalDatabaseUrl;
        }
      }
    },
    30_000,
  );
});
