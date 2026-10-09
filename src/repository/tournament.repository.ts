import { db } from "../prisma/db.ts";

type CreateTournamentData = Parameters<typeof db.orm.public.Tournament.create>[0];
type UpdateTournamentData = Parameters<
  ReturnType<typeof db.orm.public.Tournament.where>["update"]
>[0];

export async function findTournament(id: number) {
  return db.orm.public.Tournament.where({ id }).first();
}

export async function findTournaments(limit = 100) {
  return db.orm.public.Tournament.limit(limit).all();
}

export async function createTournament(data: CreateTournamentData) {
  return db.orm.public.Tournament.create(data);
}

export async function updateTournament(id: number, updates: UpdateTournamentData) {
  return db.orm.public.Tournament.where({ id }).update(updates);
}

export async function deleteTournament(id: number) {
  return db.orm.public.Tournament.where({ id }).delete();
}
