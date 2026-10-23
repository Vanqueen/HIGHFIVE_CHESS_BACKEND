import { Chess } from "chess.js";
import { Temporal } from "temporal-polyfill";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  appendMove: vi.fn(),
  backfillMoveFenBefore: vi.fn(),
  finishGameOnTimeout: vi.fn(),
  findMoveByGameAndPly: vi.fn(),
  findGame: vi.fn(),
  findGameParticipantsByGameId: vi.fn(),
  findMovesMissingFenBefore: vi.fn(),
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
  backfillMoveFenBefore: mocks.backfillMoveFenBefore,
  findMoveByGameAndPly: mocks.findMoveByGameAndPly,
  findMovesMissingFenBefore: mocks.findMovesMissingFenBefore,
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
      moveNumber: 1,
      san: "e4",
      from: "e2",
      to: "e4",
      promotion: null,
    });
    expect(move).not.toHaveProperty("ply");
    expect(updates).toMatchObject({
      status: "IN_PROGRESS",
      activeColor: "BLACK",
      result: null,
      terminationReason: null,
    });
    expect(updates.startedAt).toBeInstanceOf(Temporal.Instant);
  });

  it("finishes a game on threefold repetition after replaying the move history", async () => {
    const sequence = ["Nf3", "Nf6", "Ng1", "Ng8", "Nf3", "Nf6", "Ng1"];
    const history = new Chess();
    const priorMoves: Array<{ from: string; to: string; promotion: null; san: string; fenAfter: string }> = [];
    for (const san of sequence) {
      const move = history.move(san);
      if (!move) throw new Error(`Illegal move during repetition test: ${san}`);
      priorMoves.push({
        from: move.from,
        to: move.to,
        promotion: null,
        san: move.san,
        fenAfter: history.fen(),
      });
    }

    const finalMove = history.moves({ verbose: true }).find(
      (move: { from: string; to: string; san: string }) => move.from === "f6" && move.to === "g8",
    );
    if (!finalMove) throw new Error("Expected a legal final move to complete the repetition pattern.");

    const repetitionBoard = new Chess();
    for (const san of [...sequence, finalMove.san]) {
      const move = repetitionBoard.move(san);
      if (!move) throw new Error(`Illegal move during repetition verification: ${san}`);
    }
    expect(repetitionBoard.isThreefoldRepetition()).toBe(true);

    mocks.findGame.mockResolvedValue({
      id: 41,
      currentFen: history.fen(),
      status: "IN_PROGRESS",
      activeColor: "BLACK",
      pendingUndoParticipantId: null,
      initialTimeSeconds: 0,
      incrementSeconds: 0,
      whiteTimeRemainingMs: 0n,
      blackTimeRemainingMs: 0n,
      clockStartedAt: new Date(),
    });
    mocks.findGameParticipantsByGameId.mockResolvedValue([
      { id: 1, gameId: 41, userId: 7, color: "BLACK", participantType: "USER" },
      { id: 2, gameId: 41, userId: null, color: "WHITE", participantType: "AI" },
    ]);
    mocks.findMovesByGameId.mockResolvedValue(priorMoves);

    await MoveService.playMove(41, 7, { from: finalMove.from, to: finalMove.to });

    expect(mocks.appendMove).toHaveBeenCalledOnce();
    const [, , , , , updates] = mocks.appendMove.mock.calls[0];
    expect(updates).toMatchObject({
      status: "FINISHED",
      result: "DRAW",
      terminationReason: "THREEFOLD_REPETITION",
    });
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
      status: "IN_PROGRESS",
      activeColor: "WHITE",
      pendingUndoParticipantId: null,
      initialTimeSeconds: 60,
      incrementSeconds: 2,
      whiteTimeRemainingMs: 60_000n,
      blackTimeRemainingMs: 60_000n,
      clockStartedAt: new Date(Date.now() + 1_000),
    });

    await MoveService.playMove(41, 7, { from: "e2", to: "e4" });

    const [, , , , move, updates] = mocks.appendMove.mock.calls[0];
    expect(move.fenBefore).toBe(START_FEN);
    expect(updates.whiteTimeRemainingMs).toBe(62_000n);
    expect(updates.blackTimeRemainingMs).toBe(60_000n);
  });

  it("starts the clock after the opening move without charging White time or increment", async () => {
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

    const [, , , , , updates] = mocks.appendMove.mock.calls[0];
    expect(updates).toMatchObject({
      status: "IN_PROGRESS",
      activeColor: "BLACK",
      whiteTimeRemainingMs: 60_000n,
      blackTimeRemainingMs: 60_000n,
    });
    expect(updates.clockStartedAt).toBeInstanceOf(Temporal.Instant);
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

describe("MoveService.backfillMissingFenBefore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.backfillMoveFenBefore.mockResolvedValue(true);
  });

  it("uses the prior ply's resulting position for later moves", async () => {
    const previousFen = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
    mocks.findMovesMissingFenBefore.mockResolvedValue([
      { id: 12, gameId: 41, ply: 2, from: "e7", to: "e5", promotion: null, fenAfter: "result" },
    ]);
    mocks.findMoveByGameAndPly.mockResolvedValue({ fenAfter: previousFen });

    await expect(MoveService.backfillMissingFenBefore()).resolves.toEqual({
      scanned: 1,
      updated: 1,
      unresolved: 0,
    });
    expect(mocks.backfillMoveFenBefore).toHaveBeenCalledWith(12, previousFen);
  });

  it("fills a standard opening move only when replay matches the stored result", async () => {
    const standardE4Fen =
      "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
    mocks.findMovesMissingFenBefore.mockResolvedValue([
      { id: 13, gameId: 41, ply: 1, from: "e2", to: "e4", promotion: null, fenAfter: standardE4Fen },
    ]);

    await expect(MoveService.backfillMissingFenBefore()).resolves.toEqual({
      scanned: 1,
      updated: 1,
      unresolved: 0,
    });
    expect(mocks.backfillMoveFenBefore).toHaveBeenCalledWith(13, START_FEN);
  });

  it("leaves a first move from a non-standard starting position unresolved", async () => {
    mocks.findMovesMissingFenBefore.mockResolvedValue([
      { id: 14, gameId: 41, ply: 1, from: "e2", to: "e4", promotion: null, fenAfter: "custom-position" },
    ]);

    await expect(MoveService.backfillMissingFenBefore()).resolves.toEqual({
      scanned: 1,
      updated: 0,
      unresolved: 1,
    });
    expect(mocks.backfillMoveFenBefore).not.toHaveBeenCalled();
  });
});
