export class SocketPresenceRegistry {
  private readonly socketIdsByUser = new Map<number, Set<string>>();

  add(userId: number, socketId: string) {
    const socketIds = this.socketIdsByUser.get(userId) ?? new Set<string>();
    const wasOnline = socketIds.size > 0;
    socketIds.add(socketId);
    this.socketIdsByUser.set(userId, socketIds);
    return !wasOnline && socketIds.size > 0;
  }

  remove(userId: number, socketId: string) {
    const socketIds = this.socketIdsByUser.get(userId);
    if (!socketIds) return false;

    const wasOnline = socketIds.size > 0;
    socketIds.delete(socketId);
    if (socketIds.size === 0) this.socketIdsByUser.delete(userId);
    return wasOnline && socketIds.size === 0;
  }

  hasConnections(userId: number) {
    return (this.socketIdsByUser.get(userId)?.size ?? 0) > 0;
  }
}
