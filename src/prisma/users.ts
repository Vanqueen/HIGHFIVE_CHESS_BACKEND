import { db } from "./db.ts";

export { db };

export async function listUsers(limit = 10) {
  const users = await db.orm.public.User
    .select("id", "email", "username", "createdAt")
    .limit(limit)
    .all();

  if (users.length === 0) {
    throw new Error("No users found");
  }
  console.log("users:", users);

  return users.map((user) => ({
    id: String(user.id),
    email: user.email,
    username: user.username ?? null,
    createdAt: user.createdAt,
  }));
}

export type StarterUser = Awaited<ReturnType<typeof listUsers>>[number];
