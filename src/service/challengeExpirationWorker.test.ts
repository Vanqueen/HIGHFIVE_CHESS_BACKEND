import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  expireDueChallenges: vi.fn(),
}));

vi.mock("./challengeService", () => ({
  ChallengeService: {
    expireDueChallenges: mocks.expireDueChallenges,
  },
}));

import {
  startChallengeExpirationWorker,
  stopChallengeExpirationWorker,
} from "./challengeExpirationWorker";

describe("challenge expiration worker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.expireDueChallenges.mockResolvedValue(0);
  });

  afterEach(() => {
    stopChallengeExpirationWorker();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("runs on startup and then once per minute", async () => {
    startChallengeExpirationWorker();
    await vi.waitFor(() => expect(mocks.expireDueChallenges).toHaveBeenCalledTimes(1));
    expect(mocks.expireDueChallenges).toHaveBeenCalledWith(100);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(mocks.expireDueChallenges).toHaveBeenCalledTimes(2);
  });
});
