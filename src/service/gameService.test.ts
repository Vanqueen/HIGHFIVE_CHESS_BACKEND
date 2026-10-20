import { beforeEach, describe, expect, it, vi } from "vitest";
import { Temporal } from "temporal-polyfill";

const mocks = vi.hoisted(() => ({
  acceptUndoRequest: vi.fn(),
  claimGameNoShow: vi.fn(),
  clearUndoRequest: vi.fn(),
  createUndoRequest: vi.fn(),
  finishGame: vi.fn(),
  finishGameOnTimeout: vi.fn(),
  findGame: vi.fn(),
  findGameParticipantsByGameId: vi.fn(),
  findGameParticipantsByUserId: vi.fn(),
  findMovesByGameId: vi.fn(),
  resolveDrawOffer: vi.fn(),
  setDrawOffer: vi.fn(),
  startGameClock: vi.fn(),
}));

vi.mock("../repository/game.repository", () => ({
  createGameWithParticipants: vi.fn(),
  findGame: mocks.findGame,
}));

vi.mock("../repository/game-participant.repository", () => ({
  findGameParticipantsByGameId: mocks.findGameParticipantsByGameId,
  findGameParticipantsByUserId: mocks.findGameParticipantsByUserId,
}));

vi.mock("../repository/game-action.repository", () => ({
  acceptUndoRequest: mocks.acceptUndoRequest,
  claimGameNoShow: mocks.claimGameNoShow,
  clearUndoRequest: mocks.clearUndoRequest,
  createUndoRequest: mocks.createUndoRequest,
  finishGame: mocks.finishGame,
  finishGameOnTimeout: mocks.finishGameOnTimeout,
  resolveDrawOffer: mocks.resolveDrawOffer,
  setDrawOffer: mocks.setDrawOffer,
  startGameClock: mocks.startGameClock,
}));

vi.mock("../repository/move.repository", () => ({
  findMovesByGameId: mocks.findMovesByGameId,
}));

import { GameService } from "./gameService";

const game = {
  id: 41,
  type: "LOCAL",
  status: "IN_PROGRESS",
  currentFen: "current-position",
  activeColor: "BLACK",
  pendingUndoParticipantId: 1,
  drawOfferParticipantId: null,
  initialTimeSeconds: 0,
  whiteTimeRemainingMs: 700n,
  blackTimeRemainingMs: 800n,
  clockStartedAt: null,
  startedAt: new Date(Date.now() - 61_000),
};
const participants = [
  { id: 1, gameId: 41, userId: 7, color: "WHITE", participantType: "USER" },
  { id: 2, gameId: 41, userId: 8, color: "BLACK", participantType: "USER" },
];
const latestMove = {
  id: 99,
  gameId: 41,
  participantId: 1,
  fenBefore: "previous-position",
  playedAt: new Date("2026-10-09T12:00:00Z"),
};

describe("GameService game actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findGame.mockResolvedValue(game);
    mocks.findGameParticipantsByGameId.mockResolvedValue(participants);
    mocks.findMovesByGameId.mockResolvedValue([latestMove]);
  });

  it("rejects the offering player attempting to accept their own draw offer", async () => {
    mocks.findGame.mockResolvedValue({ ...game, drawOfferParticipantId: 1 });

    await expect(GameService.respondToDraw(41, 7, true))
      .rejects.toMatchObject({ statusCode: 409 });

    expect(mocks.resolveDrawOffer).not.toHaveBeenCalled();
  });

  it("restores the saved position and resumes the last mover's clock on undo", async () => {
    mocks.acceptUndoRequest.mockResolvedValue({
      game: { ...game, currentFen: latestMove.fenBefore },
      move: latestMove,
    });

    const result = await GameService.respondToUndo(41, 8, true);

    expect(mocks.acceptUndoRequest).toHaveBeenCalledWith(
      41,
      "current-position",
      1,
      "previous-position",
      "WHITE",
      700n,
      800n,
    );
    expect(result).toMatchObject({
      accepted: true,
      game: { currentFen: "previous-position" },
      undoneMove: latestMove,
    });
  });

  it("starts the game clock only after every user participant is connected", async () => {
    const waitingGame = { ...game, status: "WAITING", activeColor: null };
    mocks.findGame.mockResolvedValue(waitingGame);
    mocks.startGameClock.mockResolvedValue({
      ...waitingGame,
      status: "IN_PROGRESS",
      activeColor: "WHITE",
    });

    const waiting = await GameService.startWhenReady(41, 7, new Set([7]));
    expect(waiting.started).toBe(false);
    expect(mocks.startGameClock).not.toHaveBeenCalled();

    const started = await GameService.startWhenReady(41, 7, new Set([7, 8]));
    expect(started.started).toBe(true);
    expect(started.game).toMatchObject({ status: "IN_PROGRESS", activeColor: "WHITE" });
    expect(mocks.startGameClock).toHaveBeenCalledOnce();
  });

  it("calculates a clock from a Temporal.Instant timestamp", async () => {
    const startedAt = Temporal.Instant.fromEpochMilliseconds(Date.now() - 250);
    mocks.findGame.mockResolvedValue({
      ...game,
      status: "IN_PROGRESS",
      initialTimeSeconds: 60,
      activeColor: "BLACK",
      clockStartedAt: startedAt,
      whiteTimeRemainingMs: 60_000n,
      blackTimeRemainingMs: 60_000n,
    });

    await expect(GameService.getClock(41)).resolves.toMatchObject({
      whiteTimeRemainingMs: "60000",
      expired: false,
    });
    const result = await GameService.getClock(41);
    expect(Number(result.blackTimeRemainingMs)).toBeLessThanOrEqual(59_800);
    expect(Number(result.blackTimeRemainingMs)).toBeGreaterThan(59_000);
    expect(mocks.finishGameOnTimeout).not.toHaveBeenCalled();
  });

  it("allows a guest participant to offer a draw using their participant id", async () => {
    mocks.findGameParticipantsByGameId.mockResolvedValue([
      participants[0],
      { ...participants[1], userId: null, participantType: "GUEST" },
    ]);
    mocks.findGame.mockResolvedValue({ ...game, pendingUndoParticipantId: null });
    mocks.setDrawOffer.mockResolvedValue(true);

    await GameService.offerDrawAsParticipant(41, 2);

    expect(mocks.setDrawOffer).toHaveBeenCalledWith(41, 2);
  });

  it("allows only the waiting black player to claim a no-show after one minute", async () => {
    mocks.findGame.mockResolvedValue({
      ...game,
      type: "TOURNAMENT",
      activeColor: "WHITE",
      currentFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      startedAt: new Date(Date.now() - 61_000),
    });
    mocks.findGameParticipantsByGameId.mockResolvedValue([
      participants[0],
      participants[1],
    ]);
    mocks.claimGameNoShow.mockResolvedValue({ status: "FINISHED", result: "BLACK_WIN" });

    await GameService.claimNoShow(41, 8, "WIN");

    expect(mocks.claimGameNoShow).toHaveBeenCalledWith(
      41,
      2,
      "WIN",
      expect.any(Date),
    );
  });

  it("checks the no-show deadline when startedAt is a Temporal.Instant", async () => {
    const startedAt = Temporal.Instant.fromEpochMilliseconds(Date.now() - 61_000);
    mocks.findGame.mockResolvedValue({
      ...game,
      type: "TOURNAMENT",
      activeColor: "WHITE",
      currentFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      startedAt,
    });
    mocks.claimGameNoShow.mockResolvedValue({ status: "FINISHED", result: "BLACK_WIN" });

    await GameService.claimNoShow(41, 8, "WIN");

    expect(mocks.claimGameNoShow).toHaveBeenCalledWith(41, 2, "WIN", startedAt);
  });

  it("allows a guest to claim a draw after the first-move no-show delay", async () => {
    mocks.findGame.mockResolvedValue({
      ...game,
      type: "ONLINE",
      activeColor: "WHITE",
      startedAt: new Date(Date.now() - 61_000),
    });
    mocks.findGameParticipantsByGameId.mockResolvedValue([
      participants[0],
      { ...participants[1], userId: null, participantType: "GUEST" },
    ]);
    mocks.claimGameNoShow.mockResolvedValue({ status: "FINISHED", result: "DRAW" });

    await GameService.claimNoShowAsParticipant(41, 2, "DRAW");

    expect(mocks.claimGameNoShow).toHaveBeenCalledWith(
      41,
      2,
      "DRAW",
      expect.any(Date),
    );
  });

  it("rejects a no-show claim before the one-minute deadline", async () => {
    mocks.findGame.mockResolvedValue({
      ...game,
      activeColor: "WHITE",
      currentFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      startedAt: new Date(),
    });

    await expect(GameService.claimNoShow(41, 8, "DRAW"))
      .rejects.toMatchObject({ statusCode: 409 });
    expect(mocks.claimGameNoShow).not.toHaveBeenCalled();
  });

  it("rejects the white player attempting to claim their own no-show", async () => {
    mocks.findGame.mockResolvedValue({
      ...game,
      activeColor: "WHITE",
      currentFen: "opening",
      startedAt: new Date(Date.now() - 61_000),
    });

    await expect(GameService.claimNoShow(41, 7, "DRAW"))
      .rejects.toMatchObject({ statusCode: 403 });
    expect(mocks.claimGameNoShow).not.toHaveBeenCalled();
  });
});
