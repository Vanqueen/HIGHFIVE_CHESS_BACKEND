import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findRatingsByUserId: vi.fn(),
}));

vi.mock("../repository/rating.repository", () => ({
  findRatingsByUserId: mocks.findRatingsByUserId,
}));

import { RatingService } from "./ratingService";

describe("RatingService.getForUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 1500 as the initial overall and per-mode rating", async () => {
    mocks.findRatingsByUserId.mockResolvedValue([]);

    await expect(RatingService.getForUser(12)).resolves.toEqual({
      overallRating: 1500,
      modes: [
        { category: "BLITZ", rating: 1500, gamesPlayed: 0, wins: 0, losses: 0, draws: 0, provisional: true },
        { category: "RAPID", rating: 1500, gamesPlayed: 0, wins: 0, losses: 0, draws: 0, provisional: true },
        { category: "CLASSICAL", rating: 1500, gamesPlayed: 0, wins: 0, losses: 0, draws: 0, provisional: true },
      ],
    });
    expect(mocks.findRatingsByUserId).toHaveBeenCalledWith(12);
  });

  it("preserves actual mode ratings and derives the global average", async () => {
    mocks.findRatingsByUserId.mockResolvedValue([
      { category: "BLITZ", rating: 1600, gamesPlayed: 8, wins: 5, losses: 2, draws: 1, provisional: true },
    ]);

    const result = await RatingService.getForUser(12);

    expect(result.overallRating).toBe(1533);
    expect(result.modes[0]).toMatchObject({ rating: 1600, gamesPlayed: 8 });
    expect(result.modes[1]).toMatchObject({ rating: 1500, gamesPlayed: 0 });
    expect(result.modes[2]).toMatchObject({ rating: 1500, gamesPlayed: 0 });
  });
});
