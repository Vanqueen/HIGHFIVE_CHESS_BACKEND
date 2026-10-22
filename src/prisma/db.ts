import "../config/environment.ts";
import postgres from "@prisma/orm-postgres/runtime";

import "temporal-polyfill/global";

import type { Contract } from "./contract.d.ts";
import contractJson from "./contract.json" with { type: "json" };

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not defined");
}

export const db = postgres<Contract>({
  contractJson,
  url: process.env.DATABASE_URL,
});

let connection: Promise<void> | undefined;

export function connectDatabase(): Promise<void> {
  if (!connection) {
    console.info("[database] Connexion à PostgreSQL...");
    connection = db.connect()
      .then(() => {
        console.info("[database] Connexion PostgreSQL établie.");
      })
      .catch((error: unknown) => {
        connection = undefined;
        console.error("[database] Échec de la connexion PostgreSQL.", error);
        throw error;
      });
  }

  return connection;
}
