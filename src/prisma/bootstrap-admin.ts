import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

const ALLOWED_ENVIRONMENTS = ["development", "test", "staging", "production"] as const;
type Environment = typeof ALLOWED_ENVIRONMENTS[number];

interface Arguments {
  env?: Environment;
  email?: string;
  username?: string;
  help: boolean;
}

function parseArguments(argv: string[]): Arguments {
  const result: Arguments = { help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") {
      result.help = true;
      continue;
    }
    if (argument !== "--env" && argument !== "--email" && argument !== "--username") {
      throw new Error(`Option inconnue : ${argument}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Une valeur est requise pour ${argument}.`);
    }
    index += 1;
    if (argument === "--env") {
      if (!ALLOWED_ENVIRONMENTS.includes(value as Environment)) {
        throw new Error(`Environnement invalide. Valeurs autorisées : ${ALLOWED_ENVIRONMENTS.join(", ")}.`);
      }
      result.env = value as Environment;
    } else if (argument === "--email") {
      result.email = value;
    } else {
      result.username = value;
    }
  }
  return result;
}

function printUsage() {
  console.info(
    "Usage : npm run admin:bootstrap -- --env <development|test|staging|production> [--email <adresse>] [--username <pseudo>]\n" +
    "Le mot de passe est demandé sans être affiché. Cette commande crée uniquement le premier administrateur.",
  );
}

async function promptLine(question: string): Promise<string> {
  const readline = createInterface({ input: stdin, output: stdout });
  try {
    return (await readline.question(question)).trim();
  } finally {
    readline.close();
  }
}

async function promptHidden(question: string): Promise<string> {
  if (!stdin.isTTY || typeof stdin.setRawMode !== "function") {
    throw new Error("Le mot de passe doit être saisi depuis un terminal interactif.");
  }

  stdout.write(question);
  stdin.setEncoding("utf8");
  stdin.setRawMode(true);
  stdin.resume();

  return new Promise<string>((resolve, reject) => {
    let value = "";
    const finish = (error?: Error) => {
      stdin.removeListener("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write("\n");
      if (error) reject(error);
      else resolve(value);
    };
    const onData = (chunk: string) => {
      for (const character of chunk) {
        if (character === "\u0003") {
          finish(new Error("Saisie annulée."));
          return;
        }
        if (character === "\r" || character === "\n") {
          finish();
          return;
        }
        if (character === "\u007f" || character === "\b") {
          value = Array.from(value).slice(0, -1).join("");
        } else if (character >= " ") {
          value += character;
        }
      }
    };
    stdin.on("data", onData);
  });
}

function describeDatabase(databaseUrl: string) {
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL ne contient pas une URL PostgreSQL valide.");
  }
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, "")) || "(nom inconnu)";
  const host = parsed.hostname || "(hôte inconnu)";
  const port = parsed.port ? `:${parsed.port}` : "";
  return `${host}${port}/${databaseName}`;
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  if (args.help) {
    printUsage();
    return;
  }
  if (!args.env) {
    throw new Error("L'environnement doit être indiqué explicitement avec --env.");
  }

  process.env.NODE_ENV = args.env;
  await import("../config/environment.ts");
  const { db, connectDatabase } = await import("./db.ts");
  const { emailValidation } = await import("../utils/email.ts");
  const { hashPassword, passwordValidation } = await import("../utils/password.ts");

  try {
    await connectDatabase();
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error("DATABASE_URL n'est pas configurée pour cet environnement.");

    const target = describeDatabase(databaseUrl);
    console.info(`Environnement : ${args.env}`);
    console.info(`Base ciblée   : ${target}`);
    console.info("Cette commande crée un compte ADMIN uniquement si aucun administrateur n'existe.");
    const confirmation = await promptLine(
      `Pour confirmer, saisissez exactement BOOTSTRAP ${args.env} : `,
    );
    if (confirmation !== `BOOTSTRAP ${args.env}`) {
      throw new Error("Confirmation incorrecte; aucune modification effectuée.");
    }

    const email = (args.email ?? await promptLine("E-mail du premier administrateur : "))
      .trim()
      .toLowerCase();
    const username = (args.username ?? await promptLine("Pseudo du premier administrateur : "))
      .trim();
    if (!emailValidation(email)) throw new Error("Format d'e-mail invalide.");
    if (!username) throw new Error("Le pseudo est requis.");

    const password = await promptHidden("Mot de passe (saisie masquée) : ");
    const passwordConfirmation = await promptHidden("Confirmer le mot de passe : ");
    if (password !== passwordConfirmation) throw new Error("Les mots de passe ne correspondent pas.");
    if (!passwordValidation(password)) {
      throw new Error(
        "Le mot de passe doit contenir au moins 8 caractères, une majuscule, une minuscule et un chiffre.",
      );
    }

    const passwordHash = await hashPassword(password);
    const createdUser = await db.transaction(async (tx) => {
      const bootstrapLock = db.raw.sql`
        SELECT pg_advisory_xact_lock(hashtext('highfive-chess-bootstrap-admin'))
      `.affectedCount().build();
      await tx.execute(bootstrapLock);

      const existingAdmin = await tx.orm.public.User
        .where({ role: "ADMIN", deletedAt: null })
        .first();
      if (existingAdmin) {
        throw new Error("Un compte administrateur existe déjà; le bootstrap est réservé au premier admin.");
      }

      const [existingEmail, existingUsername] = await Promise.all([
        tx.orm.public.User.where({ email }).first(),
        tx.orm.public.User.where({ username }).first(),
      ]);
      if (existingEmail) throw new Error("Un compte existe déjà avec cette adresse e-mail.");
      if (existingUsername) throw new Error("Ce pseudo est déjà utilisé.");

      return tx.orm.public.User.create({
        email,
        username,
        passwordHash,
        role: "ADMIN",
      });
    });

    console.info(`Premier administrateur créé : ${createdUser.username} (${createdUser.email}).`);
    console.info("Connectez-vous puis créez les autres comptes privilégiés via l'API d'administration.");
  } finally {
    await db.close();
  }
}

main().catch((error: unknown) => {
  console.error(
    "[admin:bootstrap] Échec :",
    error instanceof Error ? error.message : "Erreur inconnue.",
  );
  process.exitCode = 1;
});
