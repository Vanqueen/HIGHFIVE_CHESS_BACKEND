import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connectDatabase: vi.fn(),
  achievementUpsert: vi.fn(),
  userUpsert: vi.fn(),
}));

vi.mock("./db.ts", () => ({
  connectDatabase: mocks.connectDatabase,
  db: {
    orm: {
      public: {
        Achievement: { upsert: mocks.achievementUpsert },
        User: { upsert: mocks.userUpsert },
      },
    },
  },
}));

import { seed } from "./seed";

describe("achievement seed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connectDatabase.mockResolvedValue(undefined);
    mocks.achievementUpsert.mockResolvedValue({});
  });

  it("seeds only the achievement catalog idempotently", async () => {
    await seed();
    await seed();

    expect(mocks.connectDatabase).toHaveBeenCalledTimes(1);
    expect(mocks.achievementUpsert).toHaveBeenCalledTimes(10);
    expect(mocks.userUpsert).not.toHaveBeenCalled();
    expect(mocks.achievementUpsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        code: "FIRST_GAME",
        isActive: true,
      }),
      update: {},
      conflictOn: { code: "FIRST_GAME" },
    }));
  });
});
