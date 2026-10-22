import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createReport: vi.fn(),
  findConversationParticipants: vi.fn(),
  findGame: vi.fn(),
  findGameParticipantsByGameId: vi.fn(),
  findMessage: vi.fn(),
  findReport: vi.fn(),
  findReportsByStatus: vi.fn(),
  findUser: vi.fn(),
  reviewReport: vi.fn(),
}));

vi.mock("../repository/report.repository", () => ({
  createReport: mocks.createReport,
  findReport: mocks.findReport,
  findReportsByStatus: mocks.findReportsByStatus,
  reviewReport: mocks.reviewReport,
}));
vi.mock("../repository/game-participant.repository", () => ({
  findGameParticipantsByGameId: mocks.findGameParticipantsByGameId,
}));
vi.mock("../repository/conversation.repository", () => ({
  findConversationParticipants: mocks.findConversationParticipants,
}));
vi.mock("../repository/message.repository", () => ({
  findMessage: mocks.findMessage,
}));
vi.mock("../repository/game.repository", () => ({
  findGame: mocks.findGame,
}));
vi.mock("../repository/user.repository", () => ({
  findUser: mocks.findUser,
}));

import { ReportService } from "./reportService";

describe("ReportService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findUser.mockResolvedValue({ id: 2, deletedAt: null });
    mocks.findGame.mockResolvedValue({ id: 9 });
    mocks.findGameParticipantsByGameId.mockResolvedValue([
      { userId: 1, participantType: "USER" },
      { userId: 2, participantType: "USER" },
    ]);
    mocks.createReport.mockResolvedValue({ id: 11 });
    mocks.findReport.mockResolvedValue({ id: 11, status: "PENDING" });
    mocks.reviewReport.mockResolvedValue({ id: 11, status: "RESOLVED" });
  });

  it("creates a report about another participant in a game", async () => {
    const report = await ReportService.create(1, {
      reportedUserId: 2,
      gameId: 9,
      reason: "CHEATING",
      description: "Suspicious play",
    });

    expect(report).toEqual({ id: 11 });
    expect(mocks.createReport).toHaveBeenCalledWith(expect.objectContaining({
      reporterId: 1,
      reportedUserId: 2,
      gameId: 9,
      reason: "CHEATING",
      description: "Suspicious play",
    }));
  });

  it("rejects reports for games in which the reporter did not participate", async () => {
    mocks.findGameParticipantsByGameId.mockResolvedValue([{ userId: 2, participantType: "USER" }]);

    await expect(ReportService.create(1, {
      gameId: 9,
      reason: "CHEATING",
    })).rejects.toMatchObject({ statusCode: 403 });
    expect(mocks.createReport).not.toHaveBeenCalled();
  });

  it("rejects self-reporting and multiple targets", async () => {
    await expect(ReportService.create(1, {
      reportedUserId: 1,
      reason: "OTHER",
    })).rejects.toMatchObject({ statusCode: 422 });

    await expect(ReportService.create(1, {
      reportedUserId: 2,
      gameId: 9,
      messageId: 4,
      reason: "OTHER",
    })).rejects.toMatchObject({ statusCode: 422 });
    expect(mocks.createReport).not.toHaveBeenCalled();
  });

  it("reports the author of a message only when the reporter is a participant", async () => {
    mocks.findMessage.mockResolvedValue({
      id: 4,
      conversationId: 12,
      senderId: 2,
      deletedAt: null,
    });
    mocks.findConversationParticipants.mockResolvedValue([{ userId: 1 }, { userId: 2 }]);

    await ReportService.create(1, { messageId: 4, reason: "HARASSMENT" });

    expect(mocks.createReport).toHaveBeenCalledWith(expect.objectContaining({
      reporterId: 1,
      reportedUserId: 2,
      messageId: 4,
    }));
  });

  it("rejects reports about messages outside the reporter's conversation", async () => {
    mocks.findMessage.mockResolvedValue({
      id: 4,
      conversationId: 12,
      senderId: 2,
      deletedAt: null,
    });
    mocks.findConversationParticipants.mockResolvedValue([{ userId: 2 }, { userId: 3 }]);

    await expect(ReportService.create(1, { messageId: 4, reason: "SPAM" }))
      .rejects.toMatchObject({ statusCode: 403 });
    expect(mocks.createReport).not.toHaveBeenCalled();
  });

  it("rejects invalid reasons and out-of-range list limits", async () => {
    await expect(ReportService.create(1, {
      reportedUserId: 2,
      reason: "NOT_A_REASON" as "OTHER",
    })).rejects.toMatchObject({ statusCode: 422 });
    await expect(ReportService.listMine(1, 101))
      .rejects.toMatchObject({ statusCode: 422 });
    await expect(ReportService.listForAdmin("INVALID" as "PENDING", 20))
      .rejects.toMatchObject({ statusCode: 422 });
  });

  it("prevents a report from being closed after another administrator reviewed it", async () => {
    mocks.findReport.mockResolvedValue({ id: 11, status: "RESOLVED" });

    await expect(ReportService.review(11, 5, "REJECTED"))
      .rejects.toMatchObject({ statusCode: 409 });
    expect(mocks.reviewReport).not.toHaveBeenCalled();
  });

  it("rejects an unsupported review status", async () => {
    await expect(ReportService.review(11, 5, "PENDING"))
      .rejects.toMatchObject({ statusCode: 422 });
    expect(mocks.findReport).not.toHaveBeenCalled();
  });
});
