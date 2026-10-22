import { db } from "../prisma/db.ts";

type CreateTournamentParticipantData = Parameters<
  typeof db.orm.public.TournamentParticipant.create
>[0];
type UpdateTournamentParticipantData = Parameters<
  ReturnType<typeof db.orm.public.TournamentParticipant.where>["update"]
>[0];

export async function findTournamentParticipant(id: number) {
  return db.orm.public.TournamentParticipant.where({ id }).first();
}

export async function findTournamentParticipants(limit = 100) {
  return db.orm.public.TournamentParticipant.limit(limit).all();
}

export async function createTournamentParticipant(data: CreateTournamentParticipantData) {
  return db.orm.public.TournamentParticipant.create(data);
}

export async function updateTournamentParticipant(
  id: number,
  updates: UpdateTournamentParticipantData,
) {
  return db.orm.public.TournamentParticipant.where({ id }).update(updates);
}

export async function deleteTournamentParticipant(id: number) {
  return db.orm.public.TournamentParticipant.where({ id }).delete();
}
