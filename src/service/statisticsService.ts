import { findUserStatistics } from "../repository/statistics.repository";

export class StatisticsService {
  static async getForUser(userId: number) {
    return findUserStatistics(userId);
  }
}
