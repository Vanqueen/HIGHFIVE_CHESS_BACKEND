// src/utils/temporalDate.ts
import { Temporal } from "temporal-polyfill";

export function epochMilliseconds(value: Date | { epochMilliseconds: number }): number {
  return value instanceof Date ? value.getTime() : value.epochMilliseconds;
}

export const toTemporal = (date: Date): Temporal.Instant => {
  return Temporal.Instant.fromEpochMilliseconds(date.getTime());
};
