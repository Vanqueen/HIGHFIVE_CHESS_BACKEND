import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  acceptUndoRequest: vi.fn(),
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
});
