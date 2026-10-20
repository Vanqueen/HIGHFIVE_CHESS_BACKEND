import { Temporal } from "temporal-polyfill";
import { describe, expect, it } from "vitest";
import { epochMilliseconds } from "./temporalDate";

describe("epochMilliseconds", () => {
  it("supports Date and Temporal.Instant timestamps", () => {
    const milliseconds = 1_700_000_000_000;

    expect(epochMilliseconds(new Date(milliseconds))).toBe(milliseconds);
    expect(epochMilliseconds(Temporal.Instant.fromEpochMilliseconds(milliseconds))).toBe(
      milliseconds,
    );
  });
});
