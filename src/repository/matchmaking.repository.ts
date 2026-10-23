import { db } from "../prisma/db.ts";
import { toTemporal } from "../utils/temporalDate.ts";
import { ratingCategoryForTimeControl } from "../utils/ratingCategory";

const STANDARD_START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export async function createMatchmakingGame(
  initialTimeSeconds: number,
  incrementSeconds: number,
  userId: number | null,
) {
  return db.transaction(async (tx) => {
    const game = await tx.orm.public.Game.create({
      type: "ONLINE",
      status: "WAITING",
      isRated: false,
      ratingCategory: null,
      initialTimeSeconds,
      incrementSeconds,
      whiteTimeRemainingMs: BigInt(initialTimeSeconds) * 1000n,
      blackTimeRemainingMs: BigInt(initialTimeSeconds) * 1000n,
      activeColor: null,
      clockStartedAt: null,
      currentFen: STANDARD_START_FEN,
      startedAt: null,
      endedAt: null,
      lastActivityAt: toTemporal(new Date()),
      challengeId: null,
      tournamentRoundId: null,
    });
    const participant = await tx.orm.public.GameParticipant.create({
      gameId: game.id,
      participantType: userId === null ? "GUEST" : "USER",
      color: "WHITE",
      userId,
      tournamentParticipantId: null,
      displayName: null,
    });
    return { game, participant };
  });
}

export async function pairMatchmakingGames(
  waitingGameId: number,
  joiningGameId: number,
  joiningUserId: number | null,
  waitingColor: "WHITE" | "BLACK",
) {
  return db.transaction(async (tx) => {
    const waitingGame = await tx.orm.public.Game.where({ id: waitingGameId }).first();
    const joiningGame = await tx.orm.public.Game.where({ id: joiningGameId }).first();
    if (
      !waitingGame ||
      !joiningGame ||
      waitingGame.status !== "WAITING" ||
      joiningGame.status !== "WAITING" ||
      waitingGame.type !== "ONLINE" ||
      joiningGame.type !== "ONLINE" ||
      waitingGame.isRated ||
      joiningGame.isRated ||
      waitingGame.challengeId !== null ||
      joiningGame.challengeId !== null ||
      waitingGame.tournamentRoundId !== null ||
      joiningGame.tournamentRoundId !== null ||
      waitingGame.initialTimeSeconds !== joiningGame.initialTimeSeconds ||
      waitingGame.incrementSeconds !== joiningGame.incrementSeconds
    ) return null;

    const waitingParticipants = await tx.orm.public.GameParticipant
      .where({ gameId: waitingGameId })
      .all();
    const joiningParticipants = await tx.orm.public.GameParticipant
      .where({ gameId: joiningGameId })
      .all();
    if (
      waitingParticipants.length !== 1 ||
      joiningParticipants.length !== 1 ||
      (joiningUserId !== null &&
        (joiningParticipants[0].participantType !== "USER" ||
          joiningParticipants[0].userId !== joiningUserId)) ||
      (joiningUserId === null &&
        (joiningParticipants[0].participantType !== "GUEST" ||
          joiningParticipants[0].userId !== null))
    ) return null;

    const creator = waitingParticipants[0];
    const joiningColor = waitingColor === "WHITE" ? "BLACK" : "WHITE";
    await tx.orm.public.GameParticipant.where({ id: creator.id }).update({
      color: waitingColor,
    });
    await tx.orm.public.Game.where({ id: joiningGameId }).delete();
    const participant = await tx.orm.public.GameParticipant.create({
      gameId: waitingGameId,
      participantType: joiningUserId === null ? "GUEST" : "USER",
      color: joiningColor,
      userId: joiningUserId,
      tournamentParticipantId: null,
      displayName: null,
    });
    const isRated = creator.participantType === "USER" &&
      creator.userId !== null &&
      participant.participantType === "USER" &&
      participant.userId !== null &&
      creator.userId !== participant.userId;
    const pairedGame = await tx.orm.public.Game.where({ id: waitingGameId }).update({
      isRated,
      ratingCategory: isRated
        ? ratingCategoryForTimeControl(
            waitingGame.initialTimeSeconds,
            waitingGame.incrementSeconds,
          )
        : null,
    });
    return {
      game: pairedGame ?? waitingGame,
      participants: [
        { ...creator, color: waitingColor },
        participant,
      ],
    };
  });
}

export async function deleteMatchmakingGame(gameId: number) {
  return db.transaction(async (tx) => {
    const game = await tx.orm.public.Game.where({ id: gameId }).first();
    if (
      !game ||
      game.status !== "WAITING" ||
      game.type !== "ONLINE" ||
      game.isRated ||
      game.challengeId !== null ||
      game.tournamentRoundId !== null
    ) return false;
    const participants = await tx.orm.public.GameParticipant.where({ gameId }).all();
    if (participants.length !== 1) return false;
    await tx.orm.public.Game.where({ id: gameId }).delete();
    return true;
  });
}
