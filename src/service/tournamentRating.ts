export type RatedGameResult = "WHITE_WIN" | "BLACK_WIN" | "DRAW";

export function calculateTournamentRatingChanges(
  whiteRating: number,
  blackRating: number,
  result: RatedGameResult,
) {
  const expectedWhite = 1 / (1 + 10 ** ((blackRating - whiteRating) / 400));
  const expectedBlack = 1 - expectedWhite;
  const actualWhite = result === "WHITE_WIN" ? 1 : result === "DRAW" ? 0.5 : 0;
  const actualBlack = 1 - actualWhite;
  return {
    white: Math.round(32 * (actualWhite - expectedWhite)),
    black: Math.round(32 * (actualBlack - expectedBlack)),
  };
}
