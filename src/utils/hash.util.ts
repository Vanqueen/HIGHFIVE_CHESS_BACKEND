import bcrypt from "bcryptjs";
import crypto from "crypto";
import { getJwtSecret } from "./authConfig";

export const hashValue = async (value: string) => {
  const saltRounds = 15;

  const salt = await bcrypt.genSalt(saltRounds);
  const hashPassword = await bcrypt.hash(value, salt);
  return hashPassword;
};

export const compareValue = async (value: string, hashValue: string) => {
  const boolean = await bcrypt.compare(value, hashValue);
  return boolean;
};

export const resetDigest = (purpose: string, value: string) =>
  crypto.createHmac('sha256', getJwtSecret()).update(`${purpose}:${value}`).digest('hex');

export const digestMatches = (expected: string, actual: string) => {
  const expectedBytes = Buffer.from(expected, 'hex');
  const actualBytes = Buffer.from(actual, 'hex');
  return expectedBytes.length === actualBytes.length && crypto.timingSafeEqual(expectedBytes, actualBytes);
};
