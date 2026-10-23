import { findRatingsByUserId } from "../repository/rating.repository";

const RATING_CATEGORIES = ["BLITZ", "RAPID", "CLASSICAL"] as const;

export class RatingService {
  static async getForUser(userId: number) {
    const ratings = await findRatingsByUserId(userId);
    const byCategory = new Map(ratings.map((rating) => [rating.category, rating]));
    const modes = RATING_CATEGORIES.map((category) => {
      const rating = byCategory.get(category);
      return {
        category,
        rating: rating?.rating ?? 1500,
        gamesPlayed: rating?.gamesPlayed ?? 0,
        wins: rating?.wins ?? 0,
        losses: rating?.losses ?? 0,
        draws: rating?.draws ?? 0,
        provisional: rating?.provisional ?? true,
      };
    });
    const overallRating = Math.round(
      modes.reduce((total, mode) => total + mode.rating, 0) / modes.length,
    );

    return { overallRating, modes };
  }
}
