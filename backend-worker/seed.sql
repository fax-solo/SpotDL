CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  last_seen_at INTEGER
);

CREATE TABLE IF NOT EXISTS downloads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  track_title TEXT NOT NULL,
  track_artist TEXT DEFAULT '',
  source TEXT DEFAULT '',
  downloaded_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS user_play_counts (
  user_id INTEGER NOT NULL,
  track_id TEXT NOT NULL,
  artist TEXT NOT NULL,
  title TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 1,
  last_played INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (user_id, track_id)
);

CREATE TABLE IF NOT EXISTS user_genre_affinities (
  user_id INTEGER NOT NULL,
  genre TEXT NOT NULL,
  affinity REAL NOT NULL DEFAULT 0.5,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (user_id, genre)
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_downloads_user ON downloads(user_id);
CREATE INDEX IF NOT EXISTS idx_downloads_at ON downloads(downloaded_at);
CREATE INDEX IF NOT EXISTS idx_play_counts_user ON user_play_counts(user_id);
CREATE INDEX IF NOT EXISTS idx_genre_affinities_user ON user_genre_affinities(user_id);

CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (key, window_start)
);
