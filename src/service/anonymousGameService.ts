import { randomInt } from "node:crypto";
import { joinAnonymousGame, createAnonymousGame, findGuestParticipant } from "../repository/guest-game.repository";
import type { ChessColor } from "../utils/chessColor";
import { signGuestGameToken, verifyGuestGameToken } from "../utils/guestGameToken";
import HttpError, { rethrowServiceError } from "./errorService";

type ColorPreference = ChessColor | "RANDOM";

const MAX_INITIAL_TIME_SECONDS = 2 * 60 * 60;
const MAX_INCREMENT_SECONDS = 180;
const INVITE_LIFETIME_SECONDS = 30 * 60;
const SESSION_LIFETIME_SECONDS = 12 * 60 * 60;

function validateTimeControl(initialTimeSeconds: number, incrementSeconds: number) {
  if (
    !Number.isSafeInteger(initialTimeSeconds) ||
    initialTimeSeconds < 0 ||
    initialTimeSeconds > MAX_INITIAL_TIME_SECONDS ||
    !Number.isSafeInteger(incrementSeconds) ||
    incrementSeconds < 0 ||
    incrementSeconds > MAX_INCREMENT_SECONDS ||
    (initialTimeSeconds === 0 && incrementSeconds !== 0)
  ) {
    throw new HttpError("Contrôle du temps invalide.", 422, false);
  }
}

export class AnonymousGameService {
  static async createGame(
    initialTimeSeconds: number,
    incrementSeconds = 0,
    colorPreference: ColorPreference = "RANDOM",
  ) {
    try {
      validateTimeControl(initialTimeSeconds, incrementSeconds);
      if (
        colorPreference !== "WHITE" &&
        colorPreference !== "BLACK" &&
        colorPreference !== "RANDOM"
      ) {
        throw new HttpError("Choix de couleur invalide.", 422, false);
      }
      const creatorColor: ChessColor = colorPreference === "RANDOM"
        ? (randomInt(2) === 0 ? "WHITE" : "BLACK")
        : colorPreference;
      const { game, participant } = await createAnonymousGame(
        initialTimeSeconds,
        incrementSeconds,
        creatorColor,
      );
      return {
        game,
        participant,
        // Anonymous creators cannot own InvitationLink rows, so the invitation is signed and stateless.
        inviteToken: signGuestGameToken(
          { kind: "guest-invite", gameId: game.id },
          INVITE_LIFETIME_SECONDS,
        ),
        guestSessionToken: signGuestGameToken(
          { kind: "guest-session", gameId: game.id, participantId: participant.id },
          SESSION_LIFETIME_SECONDS,
        ),
      };
    } catch (error) {
      rethrowServiceError(error, "Erreur lors de la création de la partie anonyme :");
    }
  }

  static async joinWithInvite(inviteToken: string, userId: number | null = null) {
    try {
      const token = verifyGuestGameToken(inviteToken, "guest-invite");
      if (!token || token.kind !== "guest-invite") {
        throw new HttpError("Lien de partie invalide ou expiré.", 410, false);
      }
      const joined = await joinAnonymousGame(token.gameId, userId);
      if (!joined) {
        throw new HttpError("La partie n'accepte plus de joueur.", 409, false);
      }
      return {
        game: joined.game,
        participant: joined.participant,
        ...(userId === null
          ? {
              guestSessionToken: signGuestGameToken(
                {
                  kind: "guest-session",
                  gameId: joined.game.id,
                  participantId: joined.participant.id,
                },
                SESSION_LIFETIME_SECONDS,
              ),
            }
          : {}),
      };
    } catch (error) {
      rethrowServiceError(error, "Erreur lors de l'accès à la partie anonyme :");
    }
  }

  static async authenticateGuestSession(gameId: number, participantId: number) {
    const participant = await findGuestParticipant(gameId, participantId);
    if (!participant) throw new HttpError("Session de joueur invité invalide.", 401, false);
    return participant;
  }
}
