CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  username TEXT UNIQUE,
  email TEXT UNIQUE,
  password_hash TEXT,
  display_name TEXT,
  avatar_path TEXT,
  auth_provider TEXT NOT NULL DEFAULT 'email',
  google_id TEXT UNIQUE,
  role TEXT NOT NULL DEFAULT 'user',
  is_guest INTEGER NOT NULL DEFAULT 0,
  device_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_active TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS history (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  album TEXT NOT NULL DEFAULT 'Unknown Album',
  artwork_url TEXT,
  duration_ms INTEGER,
  timestamp INTEGER NOT NULL DEFAULT (cast(strftime('%s','now') as integer) * 1000),
  isrc TEXT
);

CREATE TABLE IF NOT EXISTS download_logs (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  track_title TEXT,
  track_artist TEXT,
  quality TEXT,
  source TEXT,
  timestamp TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  is_guest INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_history_user_id ON history(user_id);
CREATE INDEX IF NOT EXISTS idx_history_timestamp ON history(timestamp);
CREATE INDEX IF NOT EXISTS idx_download_logs_timestamp ON download_logs(timestamp);
