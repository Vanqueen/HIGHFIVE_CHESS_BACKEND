import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  acceptFriendshipRequest: vi.fn(),
  areUsersBlocked: vi.fn(),
  createBlockAndRemoveFriendships: vi.fn(),
  createOrUpdateFriendshipRequest: vi.fn(),
  deleteBlock: vi.fn(),
  findBlocksByUser: vi.fn(),
  findFriendshipsForUser: vi.fn(),
  findUser: vi.fn(),
  publishMany: vi.fn(),
  rejectFriendshipRequest: vi.fn(),
  removeFriendshipBetweenUsers: vi.fn(),
}));

vi.mock("../repository/friendship.repository", () => ({
  acceptFriendshipRequest: mocks.acceptFriendshipRequest,
  createOrUpdateFriendshipRequest: mocks.createOrUpdateFriendshipRequest,
  findFriendshipsForUser: mocks.findFriendshipsForUser,
  removeFriendshipBetweenUsers: mocks.removeFriendshipBetweenUsers,
  rejectFriendshipRequest: mocks.rejectFriendshipRequest,
}));
vi.mock("../repository/blocked-user.repository", () => ({
  areUsersBlocked: mocks.areUsersBlocked,
  createBlockAndRemoveFriendships: mocks.createBlockAndRemoveFriendships,
  deleteBlock: mocks.deleteBlock,
  findBlocksByUser: mocks.findBlocksByUser,
}));
vi.mock("../repository/user.repository", () => ({
  findUser: mocks.findUser,
}));
vi.mock("./notificationService", () => ({
  NotificationService: { publishMany: mocks.publishMany },
}));

import { SocialService } from "./socialService";

describe("SocialService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.areUsersBlocked.mockResolvedValue(false);
    mocks.findUser.mockResolvedValue({
      username: "alice",
      accountStatus: "ACTIVE",
      deletedAt: null,
    });
  });

  it("creates a friendship request and publishes its persisted notification", async () => {
    const notification = { id: 4 };
    const friendship = { id: 7, status: "PENDING" };
    mocks.createOrUpdateFriendshipRequest.mockResolvedValue({
      kind: "created",
      friendship,
      notifications: [notification],
    });

    await expect(SocialService.requestFriendship(1, 2)).resolves.toBe(friendship);
    expect(mocks.createOrUpdateFriendshipRequest).toHaveBeenCalledWith(1, 2, "alice");
    expect(mocks.publishMany).toHaveBeenCalledWith([notification]);
  });

  it("includes the other user's username in friendship records", async () => {
    const friendship = {
      id: 8,
      requesterId: 1,
      addresseeId: 2,
      status: "PENDING",
    };
    mocks.findFriendshipsForUser.mockResolvedValue([friendship]);
    mocks.findUser.mockResolvedValue({
      username: "bob",
      accountStatus: "ACTIVE",
      deletedAt: null,
    });

    await expect(SocialService.getFriendships(1)).resolves.toEqual([
      { ...friendship, otherUsername: "bob" },
    ]);
    expect(mocks.findUser).toHaveBeenCalledWith(2);
  });

  it("rejects friendship requests when either account has blocked the other", async () => {
    mocks.areUsersBlocked.mockResolvedValue(true);

    await expect(SocialService.requestFriendship(1, 2))
      .rejects.toMatchObject({ statusCode: 403 });
    expect(mocks.createOrUpdateFriendshipRequest).not.toHaveBeenCalled();
  });

  it("removes an existing friendship when a user blocks its other participant", async () => {
    const block = { id: 12, blockerId: 1, blockedUserId: 2 };
    mocks.createBlockAndRemoveFriendships.mockResolvedValue(block);

    await expect(SocialService.blockUser(1, 2)).resolves.toBe(block);
    expect(mocks.createBlockAndRemoveFriendships).toHaveBeenCalledWith(1, 2);
  });

  it("does not allow a user to block their own account", async () => {
    await expect(SocialService.blockUser(1, 1))
      .rejects.toMatchObject({ statusCode: 422 });
    expect(mocks.createBlockAndRemoveFriendships).not.toHaveBeenCalled();
  });
});
