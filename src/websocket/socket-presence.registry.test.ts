import { describe, expect, it } from "vitest";
import { SocketPresenceRegistry } from "./socket-presence.registry";

describe("SocketPresenceRegistry", () => {
  it("keeps a user online until their final socket disconnects", () => {
    const presence = new SocketPresenceRegistry();

    expect(presence.add(7, "socket-1")).toBe(true);
    expect(presence.add(7, "socket-2")).toBe(false);
    expect(presence.hasConnections(7)).toBe(true);

    expect(presence.remove(7, "socket-1")).toBe(false);
    expect(presence.hasConnections(7)).toBe(true);

    expect(presence.remove(7, "socket-2")).toBe(true);
    expect(presence.hasConnections(7)).toBe(false);
  });

  it("ignores duplicate or unknown socket removals", () => {
    const presence = new SocketPresenceRegistry();

    expect(presence.remove(7, "unknown")).toBe(false);
    presence.add(7, "socket-1");
    expect(presence.remove(7, "socket-1")).toBe(true);
    expect(presence.remove(7, "socket-1")).toBe(false);
  });
});
