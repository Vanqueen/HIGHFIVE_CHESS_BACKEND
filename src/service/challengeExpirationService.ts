import { expirePendingChallenge } from "../repository/challenge.repository";
import { publishGameBroadcast } from "../events/game.broadcast";
import { GAME_ACTIONS } from "../events/game.events";
import { NotificationService } from "./notificationService";

export function publishChallengeExpiration(
  transition: NonNullable<Awaited<ReturnType<typeof expirePendingChallenge>>>,
) {
  NotificationService.publishMany(transition.notifications);
  publishGameBroadcast({
    type: "updated",
    gameId: transition.game.id,
    action: GAME_ACTIONS.CHALLENGE_EXPIRED,
    result: { challenge: transition.challenge, game: transition.game },
  });
}

export async function expireChallengeAndNotify(challengeId: number) {
  const transition = await expirePendingChallenge(challengeId);
  if (!transition) return null;
  publishChallengeExpiration(transition);
  return transition.challenge;
}
