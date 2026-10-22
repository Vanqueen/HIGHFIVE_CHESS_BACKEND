import { db } from "../prisma/db.ts";

type CreateGameAnalysisData = Parameters<typeof db.orm.public.GameAnalysis.create>[0];
type UpdateGameAnalysisData = Parameters<
  ReturnType<typeof db.orm.public.GameAnalysis.where>["update"]
>[0];

export async function findGameAnalysis(id: number) {
  return db.orm.public.GameAnalysis.where({ id }).first();
}

export async function findGameAnalyses(limit = 100) {
  return db.orm.public.GameAnalysis
    .orderBy((analysis) => analysis.analyzedAt.desc())
    .limit(limit)
    .all();
}

export async function findGameAnalysesByGameId(gameId: number) {
  return db.orm.public.GameAnalysis
    .where({ gameId })
    .orderBy((analysis) => analysis.analyzedAt.desc())
    .all();
}

export async function createGameAnalysis(data: CreateGameAnalysisData) {
  return db.orm.public.GameAnalysis.create(data);
}

export async function updateGameAnalysis(id: number, updates: UpdateGameAnalysisData) {
  return db.orm.public.GameAnalysis.where({ id }).update(updates);
}

export async function deleteGameAnalysis(id: number) {
  return db.orm.public.GameAnalysis.where({ id }).delete();
}
