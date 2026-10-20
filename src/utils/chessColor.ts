export type ChessColor = "WHITE" | "BLACK";

export function oppositeChessColor(color: ChessColor): ChessColor {
  return color === "WHITE" ? "BLACK" : "WHITE";
}
