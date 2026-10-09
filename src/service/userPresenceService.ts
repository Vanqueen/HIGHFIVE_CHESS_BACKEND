import { setConnectionStatus } from "../repository/user.repository";

export class UserPresenceService {
  static async setOnline(userId: number) {
    return setConnectionStatus(userId, "ONLINE");
  }

  static async setOffline(userId: number) {
    return setConnectionStatus(userId, "OFFLINE");
  }
}
