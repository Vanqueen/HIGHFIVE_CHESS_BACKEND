import "./config/environment";
import { createServer } from "node:http";
import express from "express";
import cors from "cors";
import fileUpload from "express-fileupload";
import helmet from "helmet";
import { getCorsOptions, getTrustedProxyHops } from "./config/http-security.config";
import { connectDatabase } from "./prisma/db.ts";
import authRouter from "./routes/auth";
import gameRouter from "./routes/game";
import challengesRouter from "./routes/challenges";
import invitationLinksRouter from "./routes/invitation-links";
import tournamentsRouter from "./routes/tournaments";
import usersRouter from "./routes/users";
import { errorHandler } from "./middlewares/error.middleware";
import { authApiRateLimit } from "./middlewares/auth-rate-limit.middleware";
import { attachGameGateway } from "./websocket/game.gateway";

const port = Number(process.env.PORT ?? 3000);

async function startServer() {
  console.log("Starting server...");

  let corsOptions: ReturnType<typeof getCorsOptions>;
  let trustedProxyHops: number;
  try {
    corsOptions = getCorsOptions();
    trustedProxyHops = getTrustedProxyHops();
  } catch (error) {
    console.error("Invalid HTTP security configuration:", error);
    process.exit(1);
    return;
  }

  try {
    await connectDatabase();
  } catch (error) {
    console.error("Failed to connect to PostgreSQL:", error);
    process.exit(1);
    return;
  }

  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", trustedProxyHops);
  app.use(helmet());
  app.use(cors(corsOptions));
  app.use("/api/auth", authApiRateLimit);
  app.use(express.json({ limit: "1mb" }));
  app.use(fileUpload({
    limits: { fileSize: 5 * 1024 * 1024 },
    abortOnLimit: true,
    safeFileNames: true,
    preserveExtension: true,
  }));

  app.get('/', (_request, response) => {
    response.status(200).json({ message: "Welcome to the server!" });
  });

  app.get("/health", (_request, response) => {
    console.log("Hello world from the server!");
    response.status(200).json({ success: true });
  });
  app.use("/api/auth", authRouter);
  app.use("/api/users", usersRouter);
  app.use("/api/games", gameRouter);
  app.use("/api/challenges", challengesRouter);
  app.use("/api/invitation-links", invitationLinksRouter);
  app.use("/api/tournaments", tournamentsRouter);
  app.use(errorHandler);

  const httpServer = createServer(app);
  attachGameGateway(httpServer);
  httpServer.listen(port, "0.0.0.0", () => {
    console.log(`Server running at http://localhost:${port}`);
  });
}

startServer();
