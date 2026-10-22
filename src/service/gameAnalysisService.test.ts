import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enqueueGameAnalysis: vi.fn(),
  findGameAnalysesByGameId: vi.fn(),
  getGameForUser: vi.fn(),
}));

vi.mock("../repository/game-analysis.repository", () => ({
  findGameAnalysesByGameId: mocks.findGameAnalysesByGameId,
}));
vi.mock("./gameService", () => ({
  GameService: { getGameForUser: mocks.getGameForUser },
}));
vi.mock("./stockfishAnalysisWorker", () => ({
  enqueueGameAnalysis: mocks.enqueueGameAnalysis,
}));

import { GameAnalysisService } from "./gameAnalysisService";

describe("GameAnalysisService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getGameForUser.mockResolvedValue({ game: { id: 41, status: "FINISHED" } });
    mocks.findGameAnalysesByGameId.mockResolvedValue([]);
    mocks.enqueueGameAnalysis.mockReturnValue(true);
  });

  it("returns pending and enqueues an analysis only for an authorized finished game", async () => {
    await expect(GameAnalysisService.requestForUser(41, 7))
      .resolves.toEqual({ status: "PENDING", analyses: [] });
    expect(mocks.getGameForUser).toHaveBeenCalledWith(41, 7);
    expect(mocks.enqueueGameAnalysis).toHaveBeenCalledWith(41);
  });

  it("returns persisted analyses without enqueueing another job", async () => {
    const analyses = [{ id: 9, gameId: 41, engine: "Stockfish" }];
    mocks.findGameAnalysesByGameId.mockResolvedValue(analyses);

    await expect(GameAnalysisService.getForUser(41, 7))
      .resolves.toEqual({ status: "READY", analyses });
    expect(mocks.enqueueGameAnalysis).not.toHaveBeenCalled();
  });

  it("rejects analysis before the game is finished", async () => {
    mocks.getGameForUser.mockResolvedValue({ game: { id: 41, status: "IN_PROGRESS" } });

    await expect(GameAnalysisService.requestForUser(41, 7))
      .rejects.toMatchObject({ statusCode: 409 });
    expect(mocks.findGameAnalysesByGameId).not.toHaveBeenCalled();
    expect(mocks.enqueueGameAnalysis).not.toHaveBeenCalled();
  });

  it("propagates membership denial without reading or scheduling an analysis", async () => {
    mocks.getGameForUser.mockRejectedValue(
      Object.assign(new Error("Partie introuvable."), { statusCode: 404 }),
    );

    await expect(GameAnalysisService.getForUser(41, 99))
      .rejects.toMatchObject({ statusCode: 404 });
    expect(mocks.findGameAnalysesByGameId).not.toHaveBeenCalled();
    expect(mocks.enqueueGameAnalysis).not.toHaveBeenCalled();
  });

  it("returns service unavailable when Stockfish is not configured", async () => {
    mocks.enqueueGameAnalysis.mockReturnValue(false);

    await expect(GameAnalysisService.requestForUser(41, 7))
      .rejects.toMatchObject({ statusCode: 503 });
  });
});
