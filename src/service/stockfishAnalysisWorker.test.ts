import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  gameFirst: vi.fn(),
  findGameAnalysesByGameId: vi.fn(),
  findMovesByGameId: vi.fn(),
  createGameAnalysis: vi.fn(),
  spawn: vi.fn(),
}));

vi.mock("../prisma/db.ts", () => ({
  db: {
    orm: {
      public: {
        Game: {
          where: vi.fn(() => ({ first: mocks.gameFirst })),
        },
      },
    },
  },
}));
vi.mock("../repository/game-analysis.repository", () => ({
  findGameAnalysesByGameId: mocks.findGameAnalysesByGameId,
  createGameAnalysis: mocks.createGameAnalysis,
}));
vi.mock("../repository/move.repository", () => ({
  findMovesByGameId: mocks.findMovesByGameId,
}));
vi.mock("node:child_process", () => ({
  spawn: mocks.spawn,
}));

import { analyzeGameById } from "./stockfishAnalysisWorker";

describe("analyzeGameById", () => {
  const originalEnginePath = process.env.STOCKFISH_PATH;
  const originalDepth = process.env.STOCKFISH_DEPTH;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STOCKFISH_PATH = "stockfish-test-binary";
    delete process.env.STOCKFISH_DEPTH;
    mocks.gameFirst.mockResolvedValue({ id: 42, status: "FINISHED" });
    mocks.findGameAnalysesByGameId.mockResolvedValue([]);
    mocks.findMovesByGameId.mockResolvedValue([]);
  });

  afterEach(() => {
    if (originalEnginePath === undefined) delete process.env.STOCKFISH_PATH;
    else process.env.STOCKFISH_PATH = originalEnginePath;
    if (originalDepth === undefined) delete process.env.STOCKFISH_DEPTH;
    else process.env.STOCKFISH_DEPTH = originalDepth;
  });

  it("rejects invalid IDs without querying the database", async () => {
    await expect(analyzeGameById(0)).rejects.toThrow("positive safe integer");
    expect(mocks.gameFirst).not.toHaveBeenCalled();
  });

  it("requires a configured Stockfish executable", async () => {
    delete process.env.STOCKFISH_PATH;

    await expect(analyzeGameById(42)).rejects.toThrow("STOCKFISH_PATH is not configured");
    expect(mocks.gameFirst).not.toHaveBeenCalled();
  });

  it("reports a missing game without launching the engine", async () => {
    mocks.gameFirst.mockResolvedValue(null);

    await expect(analyzeGameById(42)).resolves.toBe("GAME_NOT_FOUND");
    expect(mocks.spawn).not.toHaveBeenCalled();
  });

  it("does not analyze an unfinished game", async () => {
    mocks.gameFirst.mockResolvedValue({ id: 42, status: "IN_PROGRESS" });

    await expect(analyzeGameById(42)).resolves.toBe("GAME_NOT_FINISHED");
    expect(mocks.findGameAnalysesByGameId).not.toHaveBeenCalled();
    expect(mocks.spawn).not.toHaveBeenCalled();
  });

  it("does not launch Stockfish again when an analysis is already stored", async () => {
    mocks.findGameAnalysesByGameId.mockResolvedValue([{ id: 5, gameId: 42 }]);

    await expect(analyzeGameById(42)).resolves.toBe("ALREADY_ANALYZED");
    expect(mocks.spawn).not.toHaveBeenCalled();
  });
});
