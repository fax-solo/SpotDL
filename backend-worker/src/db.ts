export interface User {
  id: number;
  username: string;
  password_hash: string;
  role: string;
  created_at: number;
  last_seen_at: number | null;
}

export interface Download {
  id: number;
  user_id: number;
  track_title: string;
  track_artist: string;
  source: string;
  downloaded_at: number;
}

export interface D1Result<T> {
  success: boolean;
  results: T[];
}

export async function initSchema(db: D1Database): Promise<void> {
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'user', created_at INTEGER NOT NULL DEFAULT (unixepoch()), last_seen_at INTEGER)"),
    db.prepare("CREATE TABLE IF NOT EXISTS downloads (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, track_title TEXT NOT NULL, track_artist TEXT DEFAULT '', source TEXT DEFAULT '', downloaded_at INTEGER NOT NULL DEFAULT (unixepoch()))"),
    db.prepare("CREATE TABLE IF NOT EXISTS user_play_counts (user_id INTEGER NOT NULL, track_id TEXT NOT NULL, artist TEXT NOT NULL, title TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 1, last_played INTEGER NOT NULL DEFAULT (unixepoch()), PRIMARY KEY (user_id, track_id))"),
    db.prepare("CREATE TABLE IF NOT EXISTS user_genre_affinities (user_id INTEGER NOT NULL, genre TEXT NOT NULL, affinity REAL NOT NULL DEFAULT 0.5, updated_at INTEGER NOT NULL DEFAULT (unixepoch()), PRIMARY KEY (user_id, genre))"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_downloads_user ON downloads(user_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_downloads_at ON downloads(downloaded_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_play_counts_user ON user_play_counts(user_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_genre_affinities_user ON user_genre_affinities(user_id)"),
  ]);
}

export async function seedAdmin(db: D1Database, env: { ADMIN_USERNAME?: string; ADMIN_PASSWORD?: string }): Promise<void> {
  const username = env.ADMIN_USERNAME;
  const password = env.ADMIN_PASSWORD;
  if (!username || !password) return;

  const existing = await db.prepare("SELECT id FROM users WHERE username = ?").bind(username).first();
  if (existing) return;

  const hash = await hashPassword(password);
  await db.prepare("INSERT INTO users (username, password_hash, role) VALUES (?, ?, 'admin')").bind(username, hash).run();
}

export async function createUser(db: D1Database, username: string, password: string): Promise<User | null> {
  const hash = await hashPassword(password);
  const result = await db.prepare("INSERT INTO users (username, password_hash, role) VALUES (?, ?, 'user')").bind(username, hash).run() as D1Result<User>;
  if (!result.success) return null;
  const user = await db.prepare("SELECT id, username, role, created_at FROM users WHERE username = ?").bind(username).first() as User | null;
  return user;
}

export async function authenticateUser(db: D1Database, username: string, password: string): Promise<User | null> {
  const user = await db.prepare("SELECT id, username, password_hash, role, created_at FROM users WHERE username = ?").bind(username).first() as User | null;
  if (!user) return null;

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) return null;

  const now = Math.floor(Date.now() / 1000);
  await db.prepare("UPDATE users SET last_seen_at = ? WHERE id = ?").bind(now, user.id).run();
  return user;
}

export async function getUserById(db: D1Database, id: number): Promise<User | null> {
  return db.prepare("SELECT id, username, role, created_at, last_seen_at FROM users WHERE id = ?").bind(id).first() as Promise<User | null>;
}

export async function countUsers(db: D1Database): Promise<number> {
  const result = await db.prepare("SELECT COUNT(*) as count FROM users").first<{ count: number }>();
  return result?.count ?? 0;
}

export async function countActiveUsersSince(db: D1Database, since: number): Promise<number> {
  const result = await db.prepare("SELECT COUNT(*) as count FROM users WHERE last_seen_at >= ?").bind(since).first<{ count: number }>();
  return result?.count ?? 0;
}

export async function listUsers(db: D1Database): Promise<User[]> {
  const result = await db.prepare("SELECT id, username, role, created_at, last_seen_at FROM users ORDER BY created_at DESC").all<User>();
  return result.results ?? [];
}

export async function pingUser(db: D1Database, userId: number): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await db.prepare("UPDATE users SET last_seen_at = ? WHERE id = ?").bind(now, userId).run();
}

export async function recordDownload(db: D1Database, userId: number, title: string, artist: string, source: string): Promise<Download | null> {
  const result = await db.prepare("INSERT INTO downloads (user_id, track_title, track_artist, source) VALUES (?, ?, ?, ?)").bind(userId, title, artist, source).run();
  if (!result.success) return null;
  const last = await db.prepare("SELECT * FROM downloads ORDER BY id DESC LIMIT 1").first() as Download | null;
  return last;
}

export async function getDownloadStats(db: D1Database, startOfMonth: number, startOfYear: number) {
  const total = (await db.prepare("SELECT COUNT(*) as count FROM downloads").first<{ count: number }>())?.count ?? 0;
  const month = (await db.prepare("SELECT COUNT(*) as count FROM downloads WHERE downloaded_at >= ?").bind(startOfMonth).first<{ count: number }>())?.count ?? 0;
  const year = (await db.prepare("SELECT COUNT(*) as count FROM downloads WHERE downloaded_at >= ?").bind(startOfYear).first<{ count: number }>())?.count ?? 0;
  return { total, month, year };
}

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" }, key, 256);
  const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, "0")).join("");
  const hashHex = Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, "0")).join("");
  return `${saltHex}:${hashHex}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const salt = new Uint8Array(saltHex.match(/.{2}/g)!.map(b => parseInt(b, 16)));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" }, key, 256);
  const computedHex = Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, "0")).join("");
  return computedHex === hashHex;
}
