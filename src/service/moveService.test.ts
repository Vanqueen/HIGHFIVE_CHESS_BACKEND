import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  appendMove: vi.fn(),
  finishGameOnTimeout: vi.fn(),
  findGame: vi.fn(),
  findGameParticipantsByGameId: vi.fn(),
  findMovesByGameId: vi.fn(),
}));

vi.mock("../repository/game.repository", () => ({
  findGame: mocks.findGame,
}));

vi.mock("../repository/game-participant.repository", () => ({
  findGameParticipantsByGameId: mocks.findGameParticipantsByGameId,
}));

vi.mock("../repository/move.repository", () => ({
  appendMove: mocks.appendMove,
  findMovesByGameId: mocks.findMovesByGameId,
}));

vi.mock("../repository/game-action.repository", () => ({
  finishGameOnTimeout: mocks.finishGameOnTimeout,
}));

import { MoveService } from "./moveService";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function setupGame() {
  mocks.findGame.mockResolvedValue({
    id: 41,
    currentFen: START_FEN,
    status: "WAITING",
    activeColor: null,
    pendingUndoParticipantId: null,
    initialTimeSeconds: 0,
    incrementSeconds: 0,
    whiteTimeRemainingMs: 0n,
    blackTimeRemainingMs: 0n,
    clockStartedAt: null,
  });
  mocks.findGameParticipantsByGameId.mockResolvedValue([
    { id: 1, gameId: 41, userId: 7, color: "WHITE", participantType: "USER" },
    { id: 2, gameId: 41, userId: null, color: "BLACK", participantType: "AI" },
  ]);
  mocks.findMovesByGameId.mockResolvedValue([]);
  mocks.appendMove.mockResolvedValue({ game: { id: 41 }, move: { id: 99 } });
}

describe("MoveService.playMove", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupGame();
  });

  it("persists a legal opening move and starts the game", async () => {
    const result = await MoveService.playMove(41, 7, { from: "e2", to: "e4" });

    expect(result).toEqual({ game: { id: 41 }, move: { id: 99 } });
    expect(mocks.appendMove).toHaveBeenCalledOnce();
    const [gameId, expectedFen, expectedStatus, expectedColor, move, updates] =
      mocks.appendMove.mock.calls[0];
    expect([gameId, expectedFen, expectedStatus, expectedColor]).toEqual([
      41,
      START_FEN,
      "WAITING",
      null,
    ]);
    expect(move).toMatchObject({
      participantId: 1,
      ply: 1,
      moveNumber: 1,
      san: "e4",
      from: "e2",
      to: "e4",
      promotion: null,
    });
    expect(updates).toMatchObject({
      status: "IN_PROGRESS",
      activeColor: "BLACK",
      result: null,
      terminationReason: null,
    });
    expect(updates.startedAt).toBeInstanceOf(Date);
  });

  it("rejects illegal moves without persisting them", async () => {
    await expect(
      MoveService.playMove(41, 7, { from: "e2", to: "e5" }),
    ).rejects.toMatchObject({ statusCode: 422 });

    expect(mocks.appendMove).not.toHaveBeenCalled();
  });

  it("rejects a move from a non-participant", async () => {
    await expect(
      MoveService.playMove(41, 8, { from: "e2", to: "e4" }),
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(mocks.appendMove).not.toHaveBeenCalled();
  });

  it("applies the configured Fischer increment to the moving player's clock", async () => {
    mocks.findGame.mockResolvedValue({
      id: 41,
      currentFen: START_FEN,
      status: "WAITING",
      activeColor: null,
      pendingUndoParticipantId: null,
      initialTimeSeconds: 60,
      incrementSeconds: 2,
      whiteTimeRemainingMs: 60_000n,
      blackTimeRemainingMs: 60_000n,
      clockStartedAt: null,
    });

    await MoveService.playMove(41, 7, { from: "e2", to: "e4" });

    const [, , , , move, updates] = mocks.appendMove.mock.calls[0];
    expect(move.fenBefore).toBe(START_FEN);
    expect(updates.whiteTimeRemainingMs).toBe(62_000n);
    expect(updates.blackTimeRemainingMs).toBe(60_000n);
  });

  it("finishes the game instead of accepting a move after the clock expires", async () => {
    mocks.findGame.mockResolvedValueOnce({
      id: 41,
      currentFen: START_FEN,
      status: "IN_PROGRESS",
      activeColor: "WHITE",
      pendingUndoParticipantId: null,
      initialTimeSeconds: 60,
      incrementSeconds: 0,
      whiteTimeRemainingMs: 100n,
      blackTimeRemainingMs: 60_000n,
      clockStartedAt: new Date(Date.now() - 1_000),
    }).mockResolvedValueOnce({ id: 41, status: "FINISHED" });
    mocks.finishGameOnTimeout.mockResolvedValue({ id: 41 });

    await expect(
      MoveService.playMove(41, 7, { from: "e2", to: "e4" }),
    ).resolves.toMatchObject({ timedOut: true, game: { status: "FINISHED" } });

    expect(mocks.finishGameOnTimeout).toHaveBeenCalledOnce();
    expect(mocks.appendMove).not.toHaveBeenCalled();
  });
});
