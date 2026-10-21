import { describe, expect, it } from "vitest";
import { calculateAchievementProgress } from "./achievementProgress";

const progressValues = {
  gamesPlayed: 12,
  wins: 8,
  draws: 2,
  tournamentsPlayed: 3,
  tournamentsWon: 1,
  ratingReached: 1820,
  friendsCount: 4,
  winStreak: 3,
};

describe("calculateAchievementProgress", () => {
  it.each([
    ["GAMES_PLAYED", 12],
    ["WINS", 8],
    ["DRAWS", 2],
    ["TOURNAMENTS_PLAYED", 3],
    ["TOURNAMENTS_WON", 1],
    ["RATING_REACHED", 1820],
    ["FRIENDS_COUNT", 4],
    ["STREAK", 3],
  ] as const)("uses the correct metric for %s", (requirement, expected) => {
    expect(calculateAchievementProgress(requirement, progressValues)).toBe(expected);
  });
});
