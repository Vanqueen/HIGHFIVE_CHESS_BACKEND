import { db } from "../prisma/db.ts";

export type CreateGameData = Parameters<typeof db.orm.public.Game.create>[0];
export type UpdateGameData = Parameters<ReturnType<typeof db.orm.public.Game.where>["update"]>[0];
export type CreateGameParticipantData = Omit<
  Parameters<typeof db.orm.public.GameParticipant.create>[0],
  "gameId"
>;

export async function findGame(id: number) {
  return db.orm.public.Game.where({ id }).first();
}

export async function findGamesByChallenge(challengeId: number, limit = 100) {
  return db.orm.public.Game.where({ challengeId })
    .orderBy((game) => game.createdAt.desc())
    .limit(limit)
    .all();
}

export async function findGamesByTournamentRound(tournamentRoundId: number, limit = 100) {
  return db.orm.public.Game.where({ tournamentRoundId })
    .orderBy((game) => game.createdAt.desc())
    .limit(limit)
    .all();
}

export async function findGames(limit = 100) {
  return db.orm.public.Game.orderBy((game) => game.createdAt.desc()).limit(limit).all();
}

export async function createGame(data: CreateGameData) {
  return db.orm.public.Game.create(data);
}

export async function createGameWithParticipants(
  data: CreateGameData,
  participants: CreateGameParticipantData[],
) {
  return db.transaction(async (tx) => {
    const game = await tx.orm.public.Game.create(data);
    const createdParticipants = [];

    for (const participant of participants) {
      createdParticipants.push(
        await tx.orm.public.GameParticipant.create({ ...participant, gameId: game.id }),
      );
    }

    return { game, participants: createdParticipants };
  });
}

export async function updateGame(id: number, updates: UpdateGameData) {
  return db.orm.public.Game.where({ id }).update(updates);
}

export async function deleteGame(id: number) {
  return db.orm.public.Game.where({ id }).delete();
}
