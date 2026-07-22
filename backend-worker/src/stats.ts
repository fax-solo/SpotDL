import { Context } from "hono";
import { pingUser, recordDownload } from "./db";

export async function ping(c: Context) {
  const userId = c.get("userId") as number;
  const db = c.env.DB as D1Database;
  await pingUser(db, userId);
  return c.json({ status: "ok" });
}

export async function trackDownload(c: Context) {
  const userId = c.get("userId") as number;
  const { title, artist, source } = await c.req.json();
  if (!title) return c.json({ error: "title required" }, 400);

  const db = c.env.DB as D1Database;
  const dl = await recordDownload(db, userId, title, artist || "", source || "");
  return c.json(dl);
}
