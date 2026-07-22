import { Hono } from "hono";
import { cors } from "hono/cors";
import { jwt } from "hono/jwt";

import { register, login, me } from "./auth";
import { ping, trackDownload } from "./stats";
import { adminStats, adminUsers } from "./admin";

type Env = {
  DB: D1Database;
  JWT_SECRET: string;
  ADMIN_USERNAME?: string;
  ADMIN_PASSWORD?: string;
};

const app = new Hono<{ Bindings: Env; Variables: { userId: number; username: string; role: string } }>();

app.use("/*", cors());

// Public
app.post("/api/auth/register", register);
app.post("/api/auth/login", login);

// Authenticated
const auth: Parameters<typeof app.use>[1] = async (c, next) => {
  const mw = jwt({ secret: c.env.JWT_SECRET || "fallback-secret", alg: "HS256" });
  return mw(c, next);
};

app.get("/api/auth/me", auth, async (c) => {
  const payload = c.get("jwtPayload") as { userId: number; username: string; role: string };
  c.set("userId", payload.userId);
  c.set("username", payload.username);
  c.set("role", payload.role);
  return me(c);
});

app.post("/api/stats/ping", auth, async (c) => {
  const payload = c.get("jwtPayload") as { userId: number };
  c.set("userId", payload.userId);
  return ping(c);
});

app.post("/api/stats/download", auth, async (c) => {
  const payload = c.get("jwtPayload") as { userId: number };
  c.set("userId", payload.userId);
  return trackDownload(c);
});

// Admin only
const requireAdmin: Parameters<typeof app.use>[1] = async (c, next) => {
  const payload = c.get("jwtPayload") as { role?: string } | undefined;
  if (!payload || payload.role !== "admin") return c.json({ error: "forbidden" }, 403);
  await next();
};

app.get("/api/admin/stats", auth, requireAdmin, async (c) => {
  const payload = c.get("jwtPayload") as { userId: number };
  c.set("userId", payload.userId);
  return adminStats(c);
});

app.get("/api/admin/users", auth, requireAdmin, async (c) => {
  const payload = c.get("jwtPayload") as { userId: number };
  c.set("userId", payload.userId);
  return adminUsers(c);
});

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: err.message }, 500);
});

export default app;
