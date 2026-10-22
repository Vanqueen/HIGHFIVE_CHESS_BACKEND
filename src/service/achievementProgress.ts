export type RequirementType =
  | "GAMES_PLAYED"
  | "WINS"
  | "DRAWS"
  | "TOURNAMENTS_PLAYED"
  | "TOURNAMENTS_WON"
  | "RATING_REACHED"
  | "FRIENDS_COUNT"
  | "STREAK";

export type AchievementProgressValues = {
  gamesPlayed: number;
  wins: number;
  draws: number;
  tournamentsPlayed: number;
  tournamentsWon: number;
  ratingReached: number;
  friendsCount: number;
  winStreak: number;
};

export function calculateAchievementProgress(
  requirementType: RequirementType,
  values: AchievementProgressValues,
) {
  return ({
    GAMES_PLAYED: values.gamesPlayed,
    WINS: values.wins,
    DRAWS: values.draws,
    TOURNAMENTS_PLAYED: values.tournamentsPlayed,
    TOURNAMENTS_WON: values.tournamentsWon,
    RATING_REACHED: values.ratingReached,
    FRIENDS_COUNT: values.friendsCount,
    STREAK: values.winStreak,
  })[requirementType];
}
