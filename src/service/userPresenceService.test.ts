import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  setConnectionStatus: vi.fn(),
}));

vi.mock("../repository/user.repository", () => ({
  setConnectionStatus: mocks.setConnectionStatus,
}));

import { UserPresenceService } from "./userPresenceService";

describe("UserPresenceService", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sets the user online through the repository", async () => {
    mocks.setConnectionStatus.mockResolvedValue(true);

    await expect(UserPresenceService.setOnline(12)).resolves.toBe(true);
    expect(mocks.setConnectionStatus).toHaveBeenCalledWith(12, "ONLINE");
  });

  it("sets the user offline through the repository", async () => {
    mocks.setConnectionStatus.mockResolvedValue(true);

    await expect(UserPresenceService.setOffline(12)).resolves.toBe(true);
    expect(mocks.setConnectionStatus).toHaveBeenCalledWith(12, "OFFLINE");
  });
});
