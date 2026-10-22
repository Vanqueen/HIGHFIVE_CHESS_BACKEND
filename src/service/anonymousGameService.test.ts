import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAnonymousGame: vi.fn(),
  findGuestParticipant: vi.fn(),
  joinAnonymousGame: vi.fn(),
  signGuestGameToken: vi.fn(),
  verifyGuestGameToken: vi.fn(),
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
    mocks.verifyGuestGameToken.mockReturnValue({ kind: "guest-invite", gameId: game.id });
    mocks.joinAnonymousGame.mockImplementation(async (_gameId, userId) => ({
      game,
      participant: userId === null ? guestParticipant : userParticipant,
    }));
    mocks.signGuestGameToken.mockReturnValue("signed-guest-token");
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
