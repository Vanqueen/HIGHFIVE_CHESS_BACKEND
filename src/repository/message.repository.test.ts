import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  conversationFirst: vi.fn(),
  conversationInclude: vi.fn(),
  conversationWhere: vi.fn(),
  messageCount: vi.fn(),
  messageWhere: vi.fn(),
}));

vi.mock("../prisma/db.ts", () => ({
  db: {
    orm: {
      public: {
        Conversation: {
          where: mocks.conversationWhere,
        },
      },
    },
  },
}));

import { countUnreadMessages } from "./message.repository";

describe("countUnreadMessages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const messageQuery = { count: mocks.messageCount, where: mocks.messageWhere };
    mocks.messageWhere.mockReturnValue(messageQuery);
    mocks.messageCount.mockReturnValue(3);
    mocks.conversationWhere.mockReturnValue({ include: mocks.conversationInclude });
    mocks.conversationInclude.mockImplementation((_relation, refine) => {
      refine(messageQuery);
      return { first: mocks.conversationFirst };
    });
    mocks.conversationFirst.mockResolvedValue({ messages: 3 });
  });

  it("counts non-deleted messages from other senders through the relation reducer", async () => {
    await expect(countUnreadMessages(5, 7, null)).resolves.toBe(3);

    expect(mocks.conversationWhere).toHaveBeenCalledWith({ id: 5 });
    expect(mocks.conversationInclude).toHaveBeenCalledWith("messages", expect.any(Function));
    expect(mocks.messageWhere).toHaveBeenCalledTimes(2);
    expect(mocks.messageWhere).toHaveBeenCalledWith({ deletedAt: null });
    expect(mocks.messageWhere).toHaveBeenLastCalledWith(expect.any(Function));
    expect(mocks.messageCount).toHaveBeenCalledOnce();
  });

  it("applies the last-read timestamp before counting", async () => {
    await countUnreadMessages(5, 7, new Date(1_700_000_000_000));

    expect(mocks.messageWhere).toHaveBeenCalledTimes(3);
    expect(mocks.messageCount).toHaveBeenCalledOnce();
  });
});
