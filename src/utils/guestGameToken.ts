import jwt from "jsonwebtoken";

export type GuestGameToken =
  | { kind: "guest-invite"; gameId: number }
  | { kind: "guest-session"; gameId: number; participantId: number };

function tokenSecret() {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) throw new Error("JWT_ACCESS_SECRET is not configured");
  return secret;
}

export function signGuestGameToken(
  payload: GuestGameToken,
  expiresInSeconds: number,
) {
  return jwt.sign(payload, tokenSecret(), { expiresIn: expiresInSeconds });
}

export function verifyGuestGameToken(token: string, expectedKind: GuestGameToken["kind"]) {
  let decoded: string | jwt.JwtPayload;
  try {
    decoded = jwt.verify(token, tokenSecret());
  } catch {
    return null;
  }
  if (
    typeof decoded === "string" ||
    decoded.kind !== expectedKind ||
    !Number.isSafeInteger(decoded.gameId) ||
    (decoded.gameId as number) <= 0
  ) {
    return null;
  }
  if (
    expectedKind === "guest-session" &&
    (!Number.isSafeInteger(decoded.participantId) || (decoded.participantId as number) <= 0)
  ) {
    return null;
  }
  return decoded as unknown as GuestGameToken;
}
