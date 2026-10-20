import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Temporal } from "temporal-polyfill";

const mocks = vi.hoisted(() => ({
  createChallengeInvitationLink: vi.fn(),
  disableChallengeInvitationLink: vi.fn(),
  expireInvitationLink: vi.fn(),
  expirePendingChallenge: vi.fn(),
  findChallenge: vi.fn(),
  findChallengeInvitationLinks: vi.fn(),
  findInvitationLink: vi.fn(),
  findInvitationLinkByTokenHash: vi.fn(),
  findUser: vi.fn(),
  assertUsersCanInteract: vi.fn(),
  redeemChallengeInvitationLink: vi.fn(),
  publishMany: vi.fn(),
  publishGameBroadcast: vi.fn(),
  signGuestGameToken: vi.fn(),
}));

vi.mock("../repository/invitation-link.repository", () => ({
  createChallengeInvitationLink: mocks.createChallengeInvitationLink,
  disableChallengeInvitationLink: mocks.disableChallengeInvitationLink,
  expireInvitationLink: mocks.expireInvitationLink,
  findChallengeInvitationLinks: mocks.findChallengeInvitationLinks,
  findInvitationLink: mocks.findInvitationLink,
  findInvitationLinkByTokenHash: mocks.findInvitationLinkByTokenHash,
  redeemChallengeInvitationLink: mocks.redeemChallengeInvitationLink,
}));
vi.mock("../repository/challenge.repository", () => ({
  expirePendingChallenge: mocks.expirePendingChallenge,
  findChallenge: mocks.findChallenge,
}));
vi.mock("../repository/user.repository", () => ({
  findUser: mocks.findUser,
}));
vi.mock("./socialService", () => ({
  SocialService: { assertUsersCanInteract: mocks.assertUsersCanInteract },
}));
vi.mock("./notificationService", () => ({
  NotificationService: { publishMany: mocks.publishMany },
}));
vi.mock("../events/game.broadcast", () => ({
  publishGameBroadcast: mocks.publishGameBroadcast,
}));
vi.mock("../utils/guestGameToken", () => ({
  signGuestGameToken: mocks.signGuestGameToken,
}));

import { InvitationLinkService } from "./invitationLinkService";

const rawToken = "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG";
const hashToken = createHash("sha256").update(rawToken).digest("hex");
const pendingChallenge = {
  id: 11,
  creatorId: 3,
  invitedUserId: null,
  status: "PENDING",
  expiresAt: new Date(Date.now() + 20 * 60_000),
};

describe("InvitationLinkService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findChallenge.mockResolvedValue(pendingChallenge);
    mocks.createChallengeInvitationLink.mockImplementation(async (_creator, _challenge, tokenHash, expiresAt) => ({
      id: 12,
      tokenHash,
      type: "FRIEND_CHALLENGE",
      creatorId: 3,
      challengeId: 11,
      tournamentId: null,
      maxUses: 1,
      currentUses: 0,
      expiresAt,
      status: "ACTIVE",
    }));
    mocks.findInvitationLinkByTokenHash.mockResolvedValue({
      id: 12,
      tokenHash: hashToken,
      type: "FRIEND_CHALLENGE",
      creatorId: 3,
      challengeId: 11,
      currentUses: 0,
      maxUses: 1,
      status: "ACTIVE",
      expiresAt: new Date(Date.now() + 10 * 60_000),
    });
    mocks.findUser.mockResolvedValue({ accountStatus: "ACTIVE", deletedAt: null });
    mocks.assertUsersCanInteract.mockResolvedValue(undefined);
  });

  it("generates an opaque one-time token and stores only its hash", async () => {
    const result = await InvitationLinkService.createChallengeLink(3, 11, 10);

    expect(result).toMatchObject({ id: 12, token: expect.any(String), maxUses: 1 });
    expect(result).not.toHaveProperty("tokenHash");
    const [, , persistedHash] = mocks.createChallengeInvitationLink.mock.calls[0];
    expect(persistedHash).not.toBe(result.token);
    expect(persistedHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("generates a fresh encoded token for each link", async () => {
    const first = await InvitationLinkService.createChallengeLink(3, 11);
    const second = await InvitationLinkService.createChallengeLink(3, 11);

    expect(first.token).not.toBe(second.token);
    expect(first.token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(second.token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("keeps a Temporal.Instant challenge expiry as a Date for link persistence", async () => {
    const challengeExpiry = Temporal.Instant.fromEpochMilliseconds(Date.now() + 5 * 60_000);
    mocks.findChallenge.mockResolvedValue({
      ...pendingChallenge,
      expiresAt: challengeExpiry,
    });

    await InvitationLinkService.createChallengeLink(3, 11);

    const expiresAt = mocks.createChallengeInvitationLink.mock.calls[0][3];
    expect(expiresAt).toBeInstanceOf(Date);
    expect(expiresAt.getTime()).toBeLessThanOrEqual(challengeExpiry.epochMilliseconds);
  });

  it("only allows the challenge creator to create a link", async () => {
    await expect(InvitationLinkService.createChallengeLink(9, 11))
      .rejects.toMatchObject({ statusCode: 403 });
    expect(mocks.createChallengeInvitationLink).not.toHaveBeenCalled();
  });

  it("does not allow creating a link for an expired challenge", async () => {
    mocks.findChallenge.mockResolvedValue({
      ...pendingChallenge,
      expiresAt: new Date(Date.now() - 1),
    });

    await expect(InvitationLinkService.createChallengeLink(3, 11))
      .rejects.toMatchObject({ statusCode: 410 });
    expect(mocks.expirePendingChallenge).toHaveBeenCalledWith(11);
    expect(mocks.createChallengeInvitationLink).not.toHaveBeenCalled();
  });

  it("does not create a link for a directly invited user who is blocked", async () => {
    mocks.findChallenge.mockResolvedValue({
      ...pendingChallenge,
      invitedUserId: 7,
    });
    mocks.assertUsersCanInteract.mockRejectedValue(
      Object.assign(new Error("Cette interaction n’est pas autorisée."), { statusCode: 403 }),
    );

    await expect(InvitationLinkService.createChallengeLink(3, 11))
      .rejects.toMatchObject({ statusCode: 403 });
    expect(mocks.createChallengeInvitationLink).not.toHaveBeenCalled();
  });

  it("redeems a link with its hash and prevents accepting the same user's own challenge", async () => {
    mocks.findChallenge.mockResolvedValue(pendingChallenge);
    mocks.redeemChallengeInvitationLink.mockResolvedValue({
      challenge: { id: 11, status: "ACCEPTED" },
      game: { id: 21 },
      participant: { id: 31 },
      notifications: [],
    });

    await expect(InvitationLinkService.redeemChallengeLink(rawToken, 7))
      .resolves.toMatchObject({ challenge: { status: "ACCEPTED" }, game: { id: 21 } });
    expect(mocks.findInvitationLinkByTokenHash).toHaveBeenCalledWith(hashToken);
    expect(mocks.redeemChallengeInvitationLink).toHaveBeenCalledWith(
      12,
      hashToken,
      11,
      3,
      null,
      7,
      expect.any(Date),
      pendingChallenge.expiresAt,
    );

    await expect(InvitationLinkService.redeemChallengeLink(rawToken, 3))
      .rejects.toMatchObject({ statusCode: 409 });
  });

  it("allows an anonymous player to accept an open challenge without creating a user", async () => {
    mocks.redeemChallengeInvitationLink.mockResolvedValue({
      challenge: { id: 11, status: "ACCEPTED" },
      game: { id: 21 },
      participant: { id: 31 },
      notifications: [],
    });
    mocks.signGuestGameToken.mockReturnValue("guest-session-token");

    await expect(InvitationLinkService.redeemChallengeLink(rawToken, null))
      .resolves.toMatchObject({
        guestSessionToken: "guest-session-token",
        participant: { id: 31 },
      });
    expect(mocks.findUser).not.toHaveBeenCalled();
    expect(mocks.redeemChallengeInvitationLink).toHaveBeenCalledWith(
      12,
      hashToken,
      11,
      3,
      null,
      null,
      expect.any(Date),
      pendingChallenge.expiresAt,
    );
  });

  it("rejects malformed tokens without looking them up", async () => {
    await expect(InvitationLinkService.redeemChallengeLink("not-a-token", 7))
      .rejects.toMatchObject({ statusCode: 404 });
    expect(mocks.findInvitationLinkByTokenHash).not.toHaveBeenCalled();
  });

  it("expires an elapsed link and refuses redemption", async () => {
    mocks.findInvitationLinkByTokenHash.mockResolvedValue({
      id: 12,
      type: "FRIEND_CHALLENGE",
      challengeId: 11,
      currentUses: 0,
      maxUses: 1,
      status: "ACTIVE",
      expiresAt: new Date(Date.now() - 1),
    });

    await expect(InvitationLinkService.redeemChallengeLink(rawToken, 7))
      .rejects.toMatchObject({ statusCode: 410 });
    expect(mocks.expireInvitationLink).toHaveBeenCalledWith(12);
    expect(mocks.redeemChallengeInvitationLink).not.toHaveBeenCalled();
  });

  it("only allows the link creator to revoke a challenge link", async () => {
    mocks.findInvitationLink.mockResolvedValue({
      id: 12,
      creatorId: 3,
      challengeId: 11,
      status: "ACTIVE",
    });

    await expect(InvitationLinkService.revokeChallengeLink(8, 11, 12))
      .rejects.toMatchObject({ statusCode: 403 });
    expect(mocks.disableChallengeInvitationLink).not.toHaveBeenCalled();
  });
});
