import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createMatchmakingGame: vi.fn(),
  deleteMatchmakingGame: vi.fn(),
  pairMatchmakingGames: vi.fn(),
  signGuestGameToken: vi.fn(),
}));

vi.mock("../repository/matchmaking.repository", () => ({
  createMatchmakingGame: mocks.createMatchmakingGame,
  deleteMatchmakingGame: mocks.deleteMatchmakingGame,
  pairMatchmakingGames: mocks.pairMatchmakingGames,
}));

vi.mock("../utils/guestGameToken", () => ({
  signGuestGameToken: mocks.signGuestGameToken,
}));

import { MatchmakingService } from "./matchmakingService";
import { ratingCategoryForTimeControl } from "../utils/ratingCategory";

describe("MatchmakingService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createMatchmakingGame.mockImplementation(async (
      _initialTimeSeconds,
      _incrementSeconds,
      userId,
    ) => ({
      game: { id: 10, status: "WAITING" },
      participant: {
        id: 20,
        participantType: userId === null ? "GUEST" : "USER",
        userId,
        color: "WHITE",
      },
    }));
    mocks.pairMatchmakingGames.mockResolvedValue({
      game: { id: 10, status: "WAITING" },
      participants: [
        { id: 20, participantType: "GUEST", color: "WHITE" },
        { id: 21, participantType: "USER", userId: 7, color: "BLACK" },
      ],
    });
    mocks.signGuestGameToken.mockReturnValue("guest-session-token");
  });

  it("creates an unranked queue game for an anonymous player", async () => {
    await expect(MatchmakingService.createQueueGame(300, 5, null)).resolves.toMatchObject({
      game: { id: 10, status: "WAITING" },
      participant: { id: 20, participantType: "GUEST", userId: null },
      guestSessionToken: "guest-session-token",
    });
    expect(mocks.createMatchmakingGame).toHaveBeenCalledWith(300, 5, null);
  });

  it("creates a queue game for an authenticated player without a guest token", async () => {
    await expect(MatchmakingService.createQueueGame(300, 5, 7)).resolves.toEqual({
      game: { id: 10, status: "WAITING" },
      participant: { id: 20, participantType: "USER", userId: 7, color: "WHITE" },
    });
    expect(mocks.createMatchmakingGame).toHaveBeenCalledWith(300, 5, 7);
    expect(mocks.signGuestGameToken).not.toHaveBeenCalled();
  });

  it.each([
    [180, 0, "BLITZ"],
    [600, 0, "RAPID"],
    [900, 10, "CLASSICAL"],
  ] as const)("assigns %s+%s controls to the %s category", async (initialTime, increment, category) => {
    await MatchmakingService.createQueueGame(initialTime, increment, 7);
    expect(mocks.createMatchmakingGame).toHaveBeenCalledWith(initialTime, increment, 7);
    expect(ratingCategoryForTimeControl(initialTime, increment)).toBe(category);
  });

  it("rejects invalid time controls before creating a queue game", async () => {
    await expect(MatchmakingService.createQueueGame(0, 1, null))
      .rejects.toThrow("Contrôle du temps invalide.");
    expect(mocks.createMatchmakingGame).not.toHaveBeenCalled();
  });

  it("returns a session token for each guest in a randomly colored match", async () => {
    const result = await MatchmakingService.pair(10, 11, 7);

    expect(mocks.pairMatchmakingGames).toHaveBeenCalledWith(
      10,
      11,
      7,
      expect.stringMatching(/^(WHITE|BLACK)$/),
    );
    expect(result.guestSessionTokens).toEqual({ 20: "guest-session-token" });
    expect(result.participants.map(({ color }) => color).sort()).toEqual(["BLACK", "WHITE"]);
  });
});
