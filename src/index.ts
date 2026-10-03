import { createServer } from "node:http";
import { connectDatabase } from "./prisma/db.ts";
import { listUsers } from "./prisma/users.ts";


const port = Number(process.env.PORT ?? 3000);

async function startServer() {
  console.log("Starting server...");

  try {
    await connectDatabase();

    createServer(async (_request, response) => {
      try {
        const users = await listUsers();

        response.writeHead(200, {
          "content-type": "application/json",
        });

        response.end(JSON.stringify({ users }));
      } catch (error) {
        console.error("Failed to query users:", error);

        response.writeHead(500, {
          "content-type": "application/json",
        });

        response.end(
          JSON.stringify({ error: "Could not query users yet." }),
        );
      }
    }).listen(port, "0.0.0.0", () => {
      console.log(`Server running at http://localhost:${port}`);
    });
  } catch (error) {
    console.error("Failed to connect to PostgreSQL:", error);
    process.exit(1);
  }
}

startServer();

