export type RatingCategory = "BLITZ" | "RAPID" | "CLASSICAL";

export function ratingCategoryForTimeControl(
  initialTimeSeconds: number,
  incrementSeconds: number,
): RatingCategory {
  const estimatedGameLength = initialTimeSeconds + incrementSeconds * 40;
  if (estimatedGameLength <= 180) return "BLITZ";
  if (estimatedGameLength <= 900) return "RAPID";
  return "CLASSICAL";
}
