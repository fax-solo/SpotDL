import { Context } from "hono";
import { SignJWT } from "jose";
import { createUser, authenticateUser, getUserById } from "./db";

export async function register(c: Context) {
  const { username, password } = await c.req.json();
  if (!username || !password || username.length < 3 || password.length < 6) {
    return c.json({ error: "username min 3, password min 6" }, 400);
  }

  const db = c.env.DB as D1Database;
  const user = await createUser(db, username, password);
  if (!user) return c.json({ error: "username taken" }, 409);

  const token = await generateToken(c, user.id, user.username, user.role);
  return c.json({ token, user: { id: user.id, username: user.username, role: user.role, created_at: user.created_at } });
}

export async function login(c: Context) {
  const { username, password } = await c.req.json();
  if (!username || !password) return c.json({ error: "username and password required" }, 400);

  const db = c.env.DB as D1Database;
  const user = await authenticateUser(db, username, password);
  if (!user) return c.json({ error: "invalid credentials" }, 401);

  const token = await generateToken(c, user.id, user.username, user.role);
  return c.json({ token, user: { id: user.id, username: user.username, role: user.role, created_at: user.created_at } });
}

export async function me(c: Context) {
  const userId = c.get("userId") as number;
  const db = c.env.DB as D1Database;
  const user = await getUserById(db, userId);
  if (!user) return c.json({ error: "user not found" }, 404);
  return c.json(user);
}

async function generateToken(c: Context, userId: number, username: string, role: string): Promise<string> {
  const secret = new TextEncoder().encode(c.env.JWT_SECRET || "fallback-secret");
  return new SignJWT({ userId, username, role })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret);
}
