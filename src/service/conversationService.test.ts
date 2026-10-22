import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  areUsersBlocked: vi.fn(),
  createOrFindDirectConversation: vi.fn(),
  findDirectConversationsForUser: vi.fn(),
  findUser: vi.fn(),
}));

vi.mock("../repository/conversation.repository", () => ({
  createOrFindDirectConversation: mocks.createOrFindDirectConversation,
  findDirectConversationsForUser: mocks.findDirectConversationsForUser,
}));
vi.mock("../repository/blocked-user.repository", () => ({
  areUsersBlocked: mocks.areUsersBlocked,
}));
vi.mock("../repository/user.repository", () => ({
  findUser: mocks.findUser,
}));

import { ConversationService } from "./conversationService";

describe("ConversationService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.areUsersBlocked.mockResolvedValue(false);
    mocks.findUser.mockResolvedValue({
      id: 2,
      username: "bob",
      avatarUrl: null,
      accountStatus: "ACTIVE",
      deletedAt: null,
    });
  });

  it("opens an idempotent direct conversation for an unblocked user", async () => {
    const conversation = { id: 20, type: "DIRECT" };
    mocks.createOrFindDirectConversation.mockResolvedValue(conversation);

    await expect(ConversationService.openDirectConversation(1, 2)).resolves.toBe(conversation);
    expect(mocks.createOrFindDirectConversation).toHaveBeenCalledWith(1, 2);
  });

  it("returns direct conversation entries with the shape used by the messaging client", async () => {
    const updatedAt = new Date();
    mocks.findDirectConversationsForUser.mockResolvedValue([{
      conversation: { id: 20, type: "DIRECT", updatedAt },
      otherUserId: 2,
    }]);

    await expect(ConversationService.getDirectConversations(1)).resolves.toEqual([{
      conversationId: 20,
      otherUserId: 2,
      updatedAt,
      otherUser: { id: 2, username: "bob", avatarUrl: null },
    }]);
  });

  it("refuses direct conversations if either participant has blocked the other", async () => {
    mocks.areUsersBlocked.mockResolvedValue(true);

    await expect(ConversationService.openDirectConversation(1, 2))
      .rejects.toMatchObject({ statusCode: 403 });
    expect(mocks.createOrFindDirectConversation).not.toHaveBeenCalled();
  });
});
