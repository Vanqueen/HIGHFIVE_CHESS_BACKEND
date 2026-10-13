import { ChallengeService } from "./challengeService";

const EXPIRATION_INTERVAL_MS = 60_000;
const EXPIRATION_BATCH_SIZE = 100;

let interval: NodeJS.Timeout | undefined;
let running: Promise<void> | undefined;

function expireDueChallenges() {
  if (running) return running;

  running = ChallengeService.expireDueChallenges(EXPIRATION_BATCH_SIZE)
    .then((expiredCount) => {
      if (expiredCount > 0) {
        console.info(`[challenges] ${expiredCount} défi(s) expiré(s).`);
      }
    })
    .catch((error: unknown) => {
      console.error("[challenges] Échec de l'expiration planifiée des défis :", error);
    })
    .finally(() => {
      running = undefined;
    });
  return running;
}

export function startChallengeExpirationWorker() {
  if (interval) return;

  void expireDueChallenges();
  interval = setInterval(() => {
    void expireDueChallenges();
  }, EXPIRATION_INTERVAL_MS);
  interval.unref();
}

export function stopChallengeExpirationWorker() {
  if (!interval) return;
  clearInterval(interval);
  interval = undefined;
}
