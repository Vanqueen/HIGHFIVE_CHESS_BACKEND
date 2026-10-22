import { describe, expect, it } from "vitest";
import { calculateTournamentRatingChanges } from "./tournamentRating";

describe("tournament rating", () => {
  it("awards symmetric changes for a draw between equal ratings", () => {
    expect(calculateTournamentRatingChanges(1500, 1500, "DRAW")).toEqual({
      white: 0,
      black: 0,
    });
  });

  it("uses K=32 for a decisive result between equal ratings", () => {
    expect(calculateTournamentRatingChanges(1500, 1500, "WHITE_WIN")).toEqual({
      white: 16,
      black: -16,
    });
  });

  it("rewards an upset more than an expected win", () => {
    const upset = calculateTournamentRatingChanges(1200, 1800, "WHITE_WIN");
    const expectedWin = calculateTournamentRatingChanges(1800, 1200, "WHITE_WIN");

    expect(upset.white).toBeGreaterThan(expectedWin.white);
    expect(upset.black).toBeLessThan(expectedWin.black);
  });
});
