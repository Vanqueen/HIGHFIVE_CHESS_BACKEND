import { EventEmitter } from "node:events";

type GameBroadcast =
  | { type: "updated"; gameId: number; action: string; result: unknown }
  | { type: "move-played"; gameId: number; result: unknown }
  | { type: "chat-message"; gameId: number; message: unknown };

const broadcasts = new EventEmitter();

export function publishGameBroadcast(event: GameBroadcast) {
  broadcasts.emit("broadcast", event);
}

export function subscribeToGameBroadcasts(listener: (event: GameBroadcast) => void) {
  broadcasts.on("broadcast", listener);
  return () => {
    broadcasts.off("broadcast", listener);
  };
}
