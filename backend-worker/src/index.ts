import { Hono } from "hono";
import { cors } from "hono/cors";
import { jwt } from "hono/jwt";

import { register, login, me } from "./auth";
import { ping, trackDownload } from "./stats";
import { adminStats, adminUsers } from "./admin";
import { syncPlays, getPlays, syncGenres, getGenres, clearAll } from "./recommendations";
import { createRateLimitMiddleware } from "./rate_limit";

type Env = {
  DB: D1Database;
  JWT_SECRET: string;
  ADMIN_USERNAME?: string;
  ADMIN_PASSWORD?: string;
};

// Allowed origins for CORS - add your production domains here
const ALLOWED_ORIGINS = [
  "https://spotify-downloader-5v5.pages.dev",
  "https://spotify-downloader.pages.dev",
  // Add any other production domains here
];

const app = new Hono<{ Bindings: Env; Variables: { userId: number; username: string; role: string } }>();

const corsMiddleware = cors({
  origin: (origin) => (origin ? ALLOWED_ORIGINS.includes(origin) : true),
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
  credentials: true,
});

// CORS with explicit origin allowlist:
// - Origin present + allowlisted -> CORS headers applied, request proceeds
// - Origin present + not allowlisted -> 403 (and no CORS headers)
// - Origin absent (native app) -> no CORS headers, Bearer token required on protected routes
app.use("/*", async (c, next) => {
  const origin = c.req.header("Origin")

  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    return c.json({ error: "Forbidden: Origin not allowed" }, 403)
  }

  return corsMiddleware(c, next)
})

// Rate limiting middleware
const loginRateLimit = createRateLimitMiddleware(20, "auth:login")
const registerRateLimit = createRateLimitMiddleware(10, "auth:register")

// Public (with rate limiting)
app.post("/api/auth/register", registerRateLimit, register)
app.post("/api/auth/login", loginRateLimit, login)

// Authenticated - JWT verification without fallback secret
const auth: Parameters<typeof app.use>[1] = async (c, next) => {
  const secret = c.env.JWT_SECRET
  if (!secret || secret.length === 0) {
    return c.json({ error: "Server misconfigured: JWT_SECRET not set" }, 500)
  }
  const mw = jwt({ secret, alg: "HS256" })
  return mw(c, next)
}

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

// Recommendation sync
app.post("/api/recommendations/plays", auth, async (c) => {
  const payload = c.get("jwtPayload") as { userId: number };
  c.set("userId", payload.userId);
  return syncPlays(c);
});

app.get("/api/recommendations/plays", auth, async (c) => {
  const payload = c.get("jwtPayload") as { userId: number };
  c.set("userId", payload.userId);
  return getPlays(c);
});

app.post("/api/recommendations/genres", auth, async (c) => {
  const payload = c.get("jwtPayload") as { userId: number };
  c.set("userId", payload.userId);
  return syncGenres(c);
});

app.get("/api/recommendations/genres", auth, async (c) => {
  const payload = c.get("jwtPayload") as { userId: number };
  c.set("userId", payload.userId);
  return getGenres(c);
});

app.post("/api/recommendations/clear", auth, async (c) => {
  const payload = c.get("jwtPayload") as { userId: number };
  c.set("userId", payload.userId);
  return clearAll(c);
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
