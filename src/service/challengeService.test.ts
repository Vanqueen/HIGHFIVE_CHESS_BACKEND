import { beforeEach, describe, expect, it, vi } from "vitest";
import { GAME_ACTIONS } from "../events/game.events";

const mocks = vi.hoisted(() => ({
  acceptPendingChallenge: vi.fn(),
  cancelPendingChallenge: vi.fn(),
  createChallengeWithGame: vi.fn(),
  declinePendingChallenge: vi.fn(),
  expirePendingChallenge: vi.fn(),
  findChallenge: vi.fn(),
  findChallengesByCreator: vi.fn(),
  findChallengesByInvitee: vi.fn(),
  findGamesByChallenge: vi.fn(),
  findUser: vi.fn(),
  assertUsersCanInteract: vi.fn(),
  publishGameBroadcast: vi.fn(),
  publishMany: vi.fn(),
}));

vi.mock("../repository/challenge.repository", () => ({
  acceptPendingChallenge: mocks.acceptPendingChallenge,
  cancelPendingChallenge: mocks.cancelPendingChallenge,
  createChallengeWithGame: mocks.createChallengeWithGame,
  declinePendingChallenge: mocks.declinePendingChallenge,
  expirePendingChallenge: mocks.expirePendingChallenge,
  findChallenge: mocks.findChallenge,
  findChallengesByCreator: mocks.findChallengesByCreator,
  findChallengesByInvitee: mocks.findChallengesByInvitee,
}));
vi.mock("../repository/user.repository", () => ({
  findUser: mocks.findUser,
}));
vi.mock("./socialService", () => ({
  SocialService: { assertUsersCanInteract: mocks.assertUsersCanInteract },
}));
vi.mock("../repository/game.repository", () => ({
  findGamesByChallenge: mocks.findGamesByChallenge,
}));
vi.mock("./notificationService", () => ({
  NotificationService: {
    publishMany: mocks.publishMany,
  },
}));
vi.mock("../events/game.broadcast", () => ({
  publishGameBroadcast: mocks.publishGameBroadcast,
}));

import { ChallengeService } from "./challengeService";

const activeUser = {
  username: "test-user",
  accountStatus: "ACTIVE",
  deletedAt: null,
};

describe("ChallengeService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findUser.mockResolvedValue(activeUser);
    mocks.assertUsersCanInteract.mockResolvedValue(undefined);
    mocks.findGamesByChallenge.mockResolvedValue([]);
    mocks.createChallengeWithGame.mockResolvedValue({
      challenge: { id: 10 },
      game: { id: 20 },
      participant: { id: 30 },
      notifications: [],
    });
  });

  it("creates the challenge and waiting game with the creator's selected clock", async () => {
    await expect(ChallengeService.createChallenge(3, 8, 0, 0)).resolves.toMatchObject({
      challenge: { id: 10 },
      game: { id: 20 },
    });

    expect(mocks.createChallengeWithGame).toHaveBeenCalledWith(
      expect.objectContaining({
        creatorId: 3,
        invitedUserId: 8,
        status: "PENDING",
        expiresAt: expect.any(Date),
      }),
      0,
      0,
      "test-user",
      expect.stringMatching(/^(WHITE|BLACK)$/),
      false,
      null,
    );
  });

  it("allows an open challenge when no invitee has been selected yet", async () => {
    await expect(ChallengeService.createChallenge(3, null, 600, 5)).resolves.toMatchObject({
      challenge: { id: 10 },
      game: { id: 20 },
    });
    expect(mocks.findUser).toHaveBeenCalledOnce();
    expect(mocks.createChallengeWithGame).toHaveBeenCalledWith(
      expect.objectContaining({ invitedUserId: null }),
      600,
      5,
      "test-user",
      expect.stringMatching(/^(WHITE|BLACK)$/),
      false,
      null,
    );
  });

  it.each(["WHITE", "BLACK"] as const)(
    "preserves the creator's explicit %s color choice",
    async (color) => {
      await ChallengeService.createChallenge(3, 8, 300, 0, color);

      expect(mocks.createChallengeWithGame).toHaveBeenCalledWith(
        expect.any(Object),
        300,
        0,
        "test-user",
        color,
        false,
        null,
      );
    },
  );

  it("creates rated challenges with a category derived from the selected clock", async () => {
    await ChallengeService.createChallenge(3, 8, 300, 0, "RANDOM", true);

    expect(mocks.createChallengeWithGame).toHaveBeenCalledWith(
      expect.any(Object),
      300,
      0,
      "test-user",
      expect.stringMatching(/^(WHITE|BLACK)$/),
      true,
      "RAPID",
    );
  });

  it("rejects rated challenges without a registered opponent or timed clock", async () => {
    await expect(ChallengeService.createChallenge(3, null, 300, 0, "RANDOM", true))
      .rejects.toMatchObject({ statusCode: 422 });
    await expect(ChallengeService.createChallenge(3, 8, 0, 0, "RANDOM", true))
      .rejects.toMatchObject({ statusCode: 422 });
    expect(mocks.createChallengeWithGame).not.toHaveBeenCalled();
  });

  it("rejects an unsupported color preference", async () => {
    await expect(
      ChallengeService.createChallenge(3, 8, 300, 0, "GREEN" as "WHITE"),
    ).rejects.toMatchObject({ statusCode: 422 });
    expect(mocks.createChallengeWithGame).not.toHaveBeenCalled();
  });

  it("rejects self-challenges and invalid unlimited clock increments", async () => {
    await expect(ChallengeService.createChallenge(3, 3, 300, 0))
      .rejects.toMatchObject({ statusCode: 422 });
    await expect(ChallengeService.createChallenge(3, 8, 0, 1))
      .rejects.toMatchObject({ statusCode: 422 });
    expect(mocks.createChallengeWithGame).not.toHaveBeenCalled();
  });

  it("does not create a challenge for an unavailable invitee", async () => {
    mocks.findUser.mockResolvedValueOnce(activeUser).mockResolvedValueOnce({
      ...activeUser,
      accountStatus: "SUSPENDED",
    });
    await expect(ChallengeService.createChallenge(3, 8, 300, 0))
      .rejects.toMatchObject({ statusCode: 404 });
    expect(mocks.createChallengeWithGame).not.toHaveBeenCalled();
  });

  it("rejects a direct challenge when either user has blocked the other", async () => {
    mocks.assertUsersCanInteract.mockRejectedValue(
      Object.assign(new Error("Cette interaction n’est pas autorisée."), { statusCode: 403 }),
    );

    await expect(ChallengeService.createChallenge(3, 8, 300, 0))
      .rejects.toMatchObject({ statusCode: 403 });
    expect(mocks.createChallengeWithGame).not.toHaveBeenCalled();
  });

  it("does not let a user accept a challenge addressed to someone else", async () => {
    mocks.findChallenge.mockResolvedValue({
      id: 10,
      invitedUserId: 8,
      status: "PENDING",
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(ChallengeService.acceptChallenge(10, 9))
      .rejects.toMatchObject({ statusCode: 403 });
    expect(mocks.acceptPendingChallenge).not.toHaveBeenCalled();
  });

  it("accepts a valid challenge and returns its already-configured waiting game", async () => {
    mocks.findChallenge.mockResolvedValue({
      id: 10,
      invitedUserId: 8,
      status: "PENDING",
      expiresAt: new Date(Date.now() + 60_000),
    });
    mocks.acceptPendingChallenge.mockResolvedValue({
      challenge: { id: 10, status: "ACCEPTED" },
      game: { id: 20, status: "WAITING", initialTimeSeconds: 600 },
      participant: { id: 30, color: "BLACK", userId: 8 },
      notifications: [],
    });

    await expect(ChallengeService.acceptChallenge(10, 8)).resolves.toMatchObject({
      challenge: { id: 10, status: "ACCEPTED" },
      game: { id: 20, status: "WAITING", initialTimeSeconds: 600 },
      participant: { color: "BLACK", userId: 8 },
    });
    expect(mocks.acceptPendingChallenge).toHaveBeenCalledWith(10, 8);
  });

  it("uses the associated game id for decline notifications and broadcasts", async () => {
    const challenge = {
      id: 10,
      creatorId: 3,
      invitedUserId: 8,
      status: "PENDING",
      expiresAt: new Date(Date.now() + 60_000),
    };
    const updated = { ...challenge, status: "CANCELLED" };
    const game = { id: 20, status: "CANCELLED" };
    mocks.findChallenge.mockResolvedValue(challenge);
    const notifications = [{ id: 1, userId: 3, guestParticipantId: null }];
    mocks.declinePendingChallenge.mockResolvedValue({ challenge: updated, notifications });
    mocks.findGamesByChallenge.mockResolvedValue([game]);

    await expect(ChallengeService.declineChallenge(10, 8)).resolves.toEqual(updated);
    expect(mocks.publishMany).toHaveBeenCalledWith(notifications);
    expect(mocks.publishGameBroadcast).toHaveBeenCalledWith({
      type: "updated",
      gameId: 20,
      action: GAME_ACTIONS.CHALLENGE_DECLINED,
      result: { challenge: updated, game },
    });
  });

  it("marks an expired challenge and cancels its waiting game", async () => {
    const challenge = {
      id: 10,
      creatorId: 3,
      invitedUserId: 8,
      status: "PENDING",
      expiresAt: new Date(Date.now() - 1),
      createdAt: new Date(),
    };
    mocks.findChallengesByCreator.mockResolvedValue([challenge]);
    mocks.findChallengesByInvitee.mockResolvedValue([]);

    await expect(ChallengeService.getChallengesForUser(3)).resolves.toMatchObject([
      { id: 10, status: "EXPIRED" },
    ]);
    expect(mocks.expirePendingChallenge).toHaveBeenCalledWith(10);
  });
});
