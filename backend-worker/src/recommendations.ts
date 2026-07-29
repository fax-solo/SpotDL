import { Context } from "hono";

export async function syncPlays(c: Context) {
  const userId = c.get("userId") as number;
  const db = c.env.DB as D1Database;
  const { plays } = await c.req.json<{ plays: { track_id: string; artist: string; title: string; count: number; last_played: number }[] }>();
  if (!Array.isArray(plays)) return c.json({ error: "plays array required" }, 400);

  const now = Math.floor(Date.now() / 1000);
  const stmt = db.prepare(
    `INSERT INTO user_play_counts (user_id, track_id, artist, title, count, last_played)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, track_id) DO UPDATE SET
       count = excluded.count,
       last_played = excluded.last_played,
       artist = excluded.artist,
       title = excluded.title`
  );

  const batch = plays.map(p =>
    stmt.bind(userId, p.track_id, p.artist, p.title, p.count, p.last_played || now)
  );
  if (batch.length > 0) await db.batch(batch);

  return c.json({ synced: plays.length });
}

export async function getPlays(c: Context) {
  const userId = c.get("userId") as number;
  const db = c.env.DB as D1Database;
  const result = await db.prepare(
    "SELECT track_id, artist, title, count, last_played FROM user_play_counts WHERE user_id = ? ORDER BY count DESC"
  ).bind(userId).all<{ track_id: string; artist: string; title: string; count: number; last_played: number }>();
  return c.json(result.results ?? []);
}

export async function syncGenres(c: Context) {
  const userId = c.get("userId") as number;
  const db = c.env.DB as D1Database;
  const { genres } = await c.req.json<{ genres: { genre: string; affinity: number }[] }>();
  if (!Array.isArray(genres)) return c.json({ error: "genres array required" }, 400);

  const now = Math.floor(Date.now() / 1000);
  const stmt = db.prepare(
    `INSERT INTO user_genre_affinities (user_id, genre, affinity, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, genre) DO UPDATE SET
       affinity = excluded.affinity,
       updated_at = excluded.updated_at`
  );

  const batch = genres.map(g =>
    stmt.bind(userId, g.genre, g.affinity, now)
  );
  if (batch.length > 0) await db.batch(batch);

  return c.json({ synced: genres.length });
}

export async function getGenres(c: Context) {
  const userId = c.get("userId") as number;
  const db = c.env.DB as D1Database;
  const result = await db.prepare(
    "SELECT genre, affinity, updated_at FROM user_genre_affinities WHERE user_id = ? ORDER BY affinity DESC"
  ).bind(userId).all<{ genre: string; affinity: number; updated_at: number }>();
  return c.json(result.results ?? []);
}

export async function clearAll(c: Context) {
  const userId = c.get("userId") as number;
  const db = c.env.DB as D1Database;
  await db.batch([
    db.prepare("DELETE FROM user_play_counts WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM user_genre_affinities WHERE user_id = ?").bind(userId),
  ]);
  return c.json({ status: "ok" });
}
