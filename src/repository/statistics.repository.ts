import { db } from "../prisma/db.ts";

export async function findUserStatistics(userId: number) {
  const statistics = await db.orm.public.UserStatistics.where({ userId }).first();
  return statistics ?? {
    userId,
    gamesPlayed: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    updatedAt: null,
  };
}
