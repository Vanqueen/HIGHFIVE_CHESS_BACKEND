import { describe, expect, it } from "vitest";
import { oppositeChessColor } from "./chessColor";

describe("oppositeChessColor", () => {
  it("assigns the opposite color to the opponent", () => {
    expect(oppositeChessColor("WHITE")).toBe("BLACK");
    expect(oppositeChessColor("BLACK")).toBe("WHITE");
  });
});
