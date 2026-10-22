import { connectDatabase, db } from "./db.ts";

const achievements = [
  { code: "FIRST_GAME", name: "Première partie", description: "Terminer une partie.", category: "GAMES", requirementType: "GAMES_PLAYED", requirementValue: 1 },
  { code: "TEN_GAMES", name: "Habitué", description: "Terminer 10 parties.", category: "GAMES", requirementType: "GAMES_PLAYED", requirementValue: 10 },
  { code: "FIRST_WIN", name: "Première victoire", description: "Remporter une partie.", category: "WINS", requirementType: "WINS", requirementValue: 1 },
  { code: "TEN_WINS", name: "Vainqueur", description: "Remporter 10 parties.", category: "WINS", requirementType: "WINS", requirementValue: 10 },
  { code: "FIRST_DRAW", name: "Partie nulle", description: "Terminer une partie nulle.", category: "GAMES", requirementType: "DRAWS", requirementValue: 1 },
  { code: "RATING_1800", name: "Expert", description: "Atteindre un classement de 1800.", category: "RATING", requirementType: "RATING_REACHED", requirementValue: 1800 },
  { code: "FIRST_TOURNAMENT", name: "En tournoi", description: "Terminer un tournoi.", category: "TOURNAMENT", requirementType: "TOURNAMENTS_PLAYED", requirementValue: 1 },
  { code: "TOURNAMENT_WIN", name: "Champion", description: "Remporter un tournoi.", category: "TOURNAMENT", requirementType: "TOURNAMENTS_WON", requirementValue: 1 },
  { code: "FIRST_FRIEND", name: "Social", description: "Avoir un ami.", category: "SOCIAL", requirementType: "FRIENDS_COUNT", requirementValue: 1 },
  { code: "WIN_STREAK_3", name: "Série gagnante", description: "Remporter trois parties de suite.", category: "SPECIAL", requirementType: "STREAK", requirementValue: 3 },
] as const;

let pendingSeed: Promise<void> | undefined;

async function runSeed(): Promise<void> {
  await connectDatabase();

  for (const achievement of achievements) {
    await db.orm.public.Achievement.upsert({
      create: { ...achievement, isActive: true },
      update: {},
      conflictOn: { code: achievement.code },
    });
  }
}

export function seed(): Promise<void> {
  pendingSeed ??= runSeed().catch((error: unknown) => {
    pendingSeed = undefined;
    throw error;
  });
  return pendingSeed;
}
