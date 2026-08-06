import { Context } from "hono";
import { SignJWT, jwtVerify } from "jose";
import { createUser, authenticateUser, getUserById } from "./db";

function getJwtSecret(c: Context): Uint8Array {
  const secret = c.env.JWT_SECRET;
  if (!secret || secret.length === 0) {
    throw new Error("JWT_SECRET environment variable is not configured. Server misconfigured.");
  }
  return new TextEncoder().encode(secret);
}

function validatePassword(password: string): string | null {
  if (password.length < 8) {
    return "Password must be at least 8 characters";
  }
  if (!/[A-Za-z]/.test(password)) {
    return "Password must contain at least one letter";
  }
  if (!/\d/.test(password)) {
    return "Password must contain at least one number";
  }
  return null;
}

export async function register(c: Context) {
  const { username, password } = await c.req.json();
  
  const passwordError = validatePassword(password);
  if (passwordError) {
    return c.json({ error: passwordError }, 400);
  }
  
  if (!username || username.length < 3) {
    return c.json({ error: "username min 3 characters" }, 400);
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
  const secret = getJwtSecret(c);
  return new SignJWT({ userId, username, role })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret);
}

export async function verifyToken(token: string, secret: string): Promise<{ userId: number; username: string; role: string } | null> {
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    return {
      userId: payload.userId as number,
      username: payload.username as string,
      role: payload.role as string,
    };
  } catch {
    return null;
  }
}
