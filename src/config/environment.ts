import dotenv from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const inheritedEnvironment = { ...process.env };
const baseEnvPath = resolve(process.cwd(), ".env");

if (existsSync(baseEnvPath)) {
  const result = dotenv.config({ path: baseEnvPath });
  if (result.error) throw result.error;
}

export const nodeEnv =
  inheritedEnvironment.NODE_ENV?.trim() ||
  process.env.NODE_ENV?.trim() ||
  "development";

const selectedEnvPath = resolve(process.cwd(), `.env.${nodeEnv}`);
if (existsSync(selectedEnvPath)) {
  const result = dotenv.config({ path: selectedEnvPath, override: true });
  if (result.error) throw result.error;
}

for (const [key, value] of Object.entries(inheritedEnvironment)) {
  if (value !== undefined) process.env[key] = value;
}

process.env.NODE_ENV = nodeEnv;

export const isProduction = nodeEnv === "production";
