import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAnonymousGame: vi.fn(),
  findGuestParticipant: vi.fn(),
  joinAnonymousGame: vi.fn(),
  randomInt: vi.fn(() => 1),
  signGuestGameToken: vi.fn(),
  verifyGuestGameToken: vi.fn(),
}));

vi.mock("node:crypto", () => ({
  randomInt: mocks.randomInt,
}));

vi.mock("../repository/guest-game.repository", () => ({
  createAnonymousGame: mocks.createAnonymousGame,
  findGuestParticipant: mocks.findGuestParticipant,
  joinAnonymousGame: mocks.joinAnonymousGame,
}));

vi.mock("../utils/guestGameToken", () => ({
  signGuestGameToken: mocks.signGuestGameToken,
  verifyGuestGameToken: mocks.verifyGuestGameToken,
}));

import { AnonymousGameService } from "./anonymousGameService";

const game = { id: 23, status: "WAITING" };
const guestParticipant = {
  id: 41,
  gameId: 23,
  participantType: "GUEST",
  userId: null,
  color: "BLACK",
};
const userParticipant = {
  id: 42,
  gameId: 23,
  participantType: "USER",
  userId: 7,
  color: "BLACK",
};

describe("AnonymousGameService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createAnonymousGame.mockResolvedValue({
      game: { ...game, status: "WAITING" },
      participant: { ...guestParticipant, color: "WHITE" },
    });
    mocks.verifyGuestGameToken.mockReturnValue({ kind: "guest-invite", gameId: game.id });
    mocks.joinAnonymousGame.mockImplementation(async (_gameId, userId) => ({
      game,
      participant: userId === null ? guestParticipant : userParticipant,
    }));
    mocks.signGuestGameToken.mockReturnValue("signed-guest-token");
  });

  it("creates an anonymous game and returns a shareable invitation without an existing token", async () => {
    const result = await AnonymousGameService.createGame(300, 5, "WHITE");

    expect(mocks.createAnonymousGame).toHaveBeenCalledWith(300, 5, "WHITE");
    expect(result).toMatchObject({
      game: { id: game.id, status: "WAITING" },
      participant: { id: guestParticipant.id, participantType: "GUEST", color: "WHITE" },
      inviteToken: "signed-guest-token",
      guestSessionToken: "signed-guest-token",
    });
    expect(mocks.signGuestGameToken).toHaveBeenCalledWith(
      { kind: "guest-invite", gameId: game.id },
      30 * 60,
    );
  });

  it("randomly assigns the creator's color when no preference is provided", async () => {
    await AnonymousGameService.createGame(300, 5);

    expect(mocks.randomInt).toHaveBeenCalledWith(2);
    expect(mocks.createAnonymousGame).toHaveBeenCalledWith(300, 5, "BLACK");
  });

  it("joins an anonymous game as a guest and returns a guest session", async () => {
    const result = await AnonymousGameService.joinWithInvite("invite-token");

    expect(mocks.joinAnonymousGame).toHaveBeenCalledWith(game.id, null);
    expect(result).toMatchObject({
      game,
      participant: guestParticipant,
      guestSessionToken: "signed-guest-token",
    });
  });

  it("joins an anonymous game as the authenticated account without issuing a guest session", async () => {
    const result = await AnonymousGameService.joinWithInvite("invite-token", 7);

    expect(mocks.joinAnonymousGame).toHaveBeenCalledWith(game.id, 7);
    expect(result).toEqual({ game, participant: userParticipant });
    expect(mocks.signGuestGameToken).not.toHaveBeenCalled();
  });
});
