import { db } from "../prisma/db.ts";
import { toTemporal } from "../utils/temporalDate.ts";
import {
  calculateAchievementProgress,
  type RequirementType,
} from "./achievementProgress";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function updateUserAchievements(tx: Transaction, userId: number) {
  const [
    statistics,
    ratings,
    tournamentParticipations,
    sentFriendships,
    receivedFriendships,
    recentGameStatistics,
    achievements,
  ] = await Promise.all([
    tx.orm.public.UserStatistics.where({ userId }).first(),
    tx.orm.public.Rating.where({ userId }).all(),
    tx.orm.public.TournamentParticipant.where({ userId, status: "FINISHED" }).all(),
    tx.orm.public.Friendship.where({ requesterId: userId, status: "ACCEPTED" }).all(),
    tx.orm.public.Friendship.where({ addresseeId: userId, status: "ACCEPTED" }).all(),
    tx.orm.public.GamePlayerStatistic
      .where({ userId })
      .orderBy((row) => row.id.desc())
      .limit(100)
      .all(),
    tx.orm.public.Achievement.where({ isActive: true }).all(),
  ]);

  const tournaments = new Map<number, number>();
  for (const participant of tournamentParticipations) {
    if (tournaments.has(participant.tournamentId)) continue;
    const rows = await tx.orm.public.TournamentParticipant
      .where({ tournamentId: participant.tournamentId, status: "FINISHED" })
      .all();
    const highestScore = Math.max(...rows.map((row) => Number(row.score)));
    tournaments.set(
      participant.tournamentId,
      rows.some((row) => row.userId === userId && Number(row.score) === highestScore) ? 1 : 0,
    );
  }

  let winStreak = 0;
  for (const row of recentGameStatistics) {
    if (row.outcome !== "WIN") break;
    winStreak += 1;
  }
  const progressValues = {
    gamesPlayed: statistics?.gamesPlayed ?? 0,
    wins: statistics?.wins ?? 0,
    draws: statistics?.draws ?? 0,
    tournamentsPlayed: tournamentParticipations.length,
    tournamentsWon: [...tournaments.values()].reduce((total, won) => total + won, 0),
    ratingReached: ratings.reduce((highest, rating) => Math.max(highest, rating.rating), 0),
    friendsCount: new Set([
      ...sentFriendships.map((friendship) => friendship.addresseeId),
      ...receivedFriendships.map((friendship) => friendship.requesterId),
    ]).size,
    winStreak,
  };
  for (const achievement of achievements) {
    const currentValue = calculateAchievementProgress(
      achievement.requirementType,
      progressValues,
    );
    const unlocked = currentValue >= achievement.requirementValue;
    const unlockedAt = toTemporal(unlocked ? new Date() : new Date(0));
    const update = db.raw.sql`
      INSERT INTO "public"."UserAchievement"
        ("userId", "achievementId", "progress", "unlockedAt")
      VALUES (
        ${userId},
        ${achievement.id},
        ${currentValue},
        CASE WHEN ${unlocked} THEN ${unlockedAt.toString()}::timestamptz ELSE NULL END
      )
      ON CONFLICT ("userId", "achievementId") DO UPDATE SET
        "progress" = GREATEST("UserAchievement"."progress", EXCLUDED."progress"),
        "unlockedAt" = COALESCE("UserAchievement"."unlockedAt", EXCLUDED."unlockedAt"),
        "updatedAt" = NOW()
    `.affectedCount().build();
    await tx.execute(update);
  }
}

export async function getUserAchievements(userId: number) {
  const achievements = await db.orm.public.UserAchievement
    .where({ userId })
    .orderBy((achievement) => achievement.createdAt.desc())
    .all();
  const result = [];
  for (const userAchievement of achievements) {
    const achievement = await db.orm.public.Achievement
      .where({ id: userAchievement.achievementId, isActive: true })
      .first();
    if (achievement) result.push({ ...userAchievement, achievement });
  }
  return result;
}
