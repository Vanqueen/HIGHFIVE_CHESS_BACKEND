import { db } from "../prisma/db.ts";
import { oppositeChessColor, type ChessColor } from "../utils/chessColor";
import { toTemporal } from "../utils/temporalDate.ts";

const STANDARD_START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export async function createAnonymousGame(
  initialTimeSeconds: number,
  incrementSeconds: number,
  creatorColor: ChessColor,
) {
  return db.transaction(async (tx) => {
    const now = new Date();
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
      lastActivityAt: toTemporal(now),
      challengeId: null,
      tournamentRoundId: null,
    });
    const participant = await tx.orm.public.GameParticipant.create({
      gameId: game.id,
      participantType: "GUEST",
      color: creatorColor,
      userId: null,
      tournamentParticipantId: null,
      displayName: null,
    });
    return { game, participant };
  });
}

export async function joinAnonymousGame(gameId: number, userId: number | null = null) {
  return db.transaction(async (tx) => {
    const game = await tx.orm.public.Game.where({ id: gameId }).first();
    if (!game || game.status !== "WAITING") return null;
    const participants = await tx.orm.public.GameParticipant.where({ gameId }).all();
    if (participants.length !== 1 || participants[0].participantType !== "GUEST") return null;

    // The unique game/color constraint makes the vacant seat a one-time invitation.
    const participant = await tx.orm.public.GameParticipant.create({
      gameId,
      participantType: userId === null ? "GUEST" : "USER",
      color: oppositeChessColor(participants[0].color),
      userId,
      tournamentParticipantId: null,
      displayName: null,
    });
    return { game, participant };
  });
}

export async function findGuestParticipant(gameId: number, participantId: number) {
  return db.orm.public.GameParticipant
    .where({ id: participantId, gameId, participantType: "GUEST", userId: null })
    .first();
}
