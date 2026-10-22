import { db } from "../prisma/db.ts";

type CreateTournamentRoundData = Parameters<
  typeof db.orm.public.TournamentRound.create
>[0];
type UpdateTournamentRoundData = Parameters<
  ReturnType<typeof db.orm.public.TournamentRound.where>["update"]
>[0];

export async function findTournamentRound(id: number) {
  return db.orm.public.TournamentRound.where({ id }).first();
}

export async function findTournamentRounds(limit = 100) {
  return db.orm.public.TournamentRound.limit(limit).all();
}

export async function createTournamentRound(data: CreateTournamentRoundData) {
  return db.orm.public.TournamentRound.create(data);
}

export async function updateTournamentRound(id: number, updates: UpdateTournamentRoundData) {
  return db.orm.public.TournamentRound.where({ id }).update(updates);
}

export async function deleteTournamentRound(id: number) {
  return db.orm.public.TournamentRound.where({ id }).delete();
}
