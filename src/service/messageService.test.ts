import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  areUsersBlocked: vi.fn(),
  broadcastConversationRead: vi.fn(),
  broadcastMessageDeleted: vi.fn(),
  broadcastMessageEdited: vi.fn(),
  broadcastNewMessage: vi.fn(),
  countUnreadMessages: vi.fn(),
  createMessage: vi.fn(),
  findConversation: vi.fn(),
  findConversationParticipant: vi.fn(),
  findConversationParticipants: vi.fn(),
  findMessage: vi.fn(),
  findMessagesForConversation: vi.fn(),
  findUser: vi.fn(),
  updateConversation: vi.fn(),
  updateConversationParticipant: vi.fn(),
  updateMessage: vi.fn(),
}));

vi.mock("../repository/message.repository", () => ({
  countUnreadMessages: mocks.countUnreadMessages,
  createMessage: mocks.createMessage,
  findMessage: mocks.findMessage,
  findMessagesForConversation: mocks.findMessagesForConversation,
  updateMessage: mocks.updateMessage,
}));
vi.mock("../repository/conversation.repository", () => ({
  findConversation: mocks.findConversation,
  findConversationParticipant: mocks.findConversationParticipant,
  findConversationParticipants: mocks.findConversationParticipants,
  updateConversation: mocks.updateConversation,
}));
vi.mock("../repository/conversation-participant.repository", () => ({
  updateConversationParticipant: mocks.updateConversationParticipant,
}));
vi.mock("../repository/blocked-user.repository", () => ({
  areUsersBlocked: mocks.areUsersBlocked,
}));
vi.mock("../repository/user.repository", () => ({
  findUser: mocks.findUser,
}));
vi.mock("./messageBroadcastService", () => ({
  MessageBroadcastService: {
    broadcastConversationRead: mocks.broadcastConversationRead,
    broadcastMessageDeleted: mocks.broadcastMessageDeleted,
    broadcastMessageEdited: mocks.broadcastMessageEdited,
    broadcastNewMessage: mocks.broadcastNewMessage,
  },
}));

import { MessageService } from "./messageService";

describe("MessageService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.areUsersBlocked.mockResolvedValue(false);
    mocks.findConversation.mockResolvedValue({ id: 5, type: "DIRECT" });
    mocks.findConversationParticipant.mockResolvedValue({
      id: 12,
      conversationId: 5,
      userId: 1,
      leftAt: null,
      lastReadAt: null,
    });
    mocks.findConversationParticipants.mockResolvedValue([
      { userId: 1 },
      { userId: 2 },
    ]);
    mocks.updateConversation.mockResolvedValue({ id: 5 });
    mocks.updateConversationParticipant.mockResolvedValue({ id: 12 });
    mocks.broadcastNewMessage.mockResolvedValue(undefined);
    mocks.broadcastConversationRead.mockResolvedValue(undefined);
  });

  it("persists and broadcasts trimmed text only for active participants", async () => {
    const message = { id: 20, conversationId: 5, senderId: 1, content: "hello" };
    mocks.createMessage.mockResolvedValue(message);

    await expect(MessageService.sendMessage(5, 1, "  hello  ")).resolves.toBe(message);
    expect(mocks.createMessage).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: 5,
      senderId: 1,
      content: "hello",
      messageType: "TEXT",
    }));
    expect(mocks.broadcastNewMessage).toHaveBeenCalledWith(5, message);
  });

  it("blocks messages when a direct conversation participant is blocked", async () => {
    mocks.areUsersBlocked.mockResolvedValue(true);

    await expect(MessageService.sendMessage(5, 1, "hello"))
      .rejects.toMatchObject({ statusCode: 403 });
    expect(mocks.createMessage).not.toHaveBeenCalled();
  });

  it("rejects invalid page sizes before querying messages", async () => {
    await expect(MessageService.getMessages(5, 1, 101))
      .rejects.toMatchObject({ statusCode: 422 });
    expect(mocks.findMessagesForConversation).not.toHaveBeenCalled();
  });

  it("loads messages and marks the participant as read", async () => {
    const messages = [{ id: 19 }, { id: 20 }];
    mocks.findMessagesForConversation.mockResolvedValue(messages);

    await expect(MessageService.getMessages(5, 1, 30)).resolves.toBe(messages);
    expect(mocks.findMessagesForConversation).toHaveBeenCalledWith(5, 30, undefined);
    expect(mocks.updateConversationParticipant).toHaveBeenCalledWith(
      12,
      expect.objectContaining({ lastReadAt: expect.anything() }),
    );
    expect(mocks.broadcastConversationRead).toHaveBeenCalledWith(
      5,
      1,
      expect.any(Date),
    );
  });

  it("only lets the author edit a recent text message", async () => {
    mocks.findMessage.mockResolvedValue({
      id: 20,
      conversationId: 5,
      senderId: 2,
      messageType: "TEXT",
      content: "old",
      createdAt: new Date(),
      deletedAt: null,
    });

    await expect(MessageService.editMessage(20, 1, "new"))
      .rejects.toMatchObject({ statusCode: 403 });
    expect(mocks.updateMessage).not.toHaveBeenCalled();
  });

  it("soft-deletes an authored message and broadcasts the deletion", async () => {
    const message = {
      id: 20,
      conversationId: 5,
      senderId: 1,
      messageType: "TEXT",
      content: "old",
      createdAt: new Date(),
      deletedAt: null,
    };
    mocks.findMessage.mockResolvedValue(message);
    mocks.updateMessage.mockResolvedValue({ ...message, deletedAt: new Date() });

    await MessageService.deleteMessage(20, 1);

    expect(mocks.updateMessage).toHaveBeenCalledWith(
      20,
      expect.objectContaining({ deletedAt: expect.anything() }),
    );
    expect(mocks.broadcastMessageDeleted).toHaveBeenCalledWith(
      5,
      20,
      expect.any(Date),
    );
  });
});
