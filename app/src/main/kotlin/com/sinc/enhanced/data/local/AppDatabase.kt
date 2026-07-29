package com.sinc.enhanced.data.local

import androidx.room.Database
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
import com.sinc.enhanced.data.local.dao.CacheDao
import com.sinc.enhanced.data.local.dao.DownloadDao
import com.sinc.enhanced.data.local.dao.HistoryDao
import com.sinc.enhanced.data.local.dao.LyricsCacheDao
import com.sinc.enhanced.data.local.dao.PlaylistDao
import com.sinc.enhanced.data.local.dao.RecommendationDao
import com.sinc.enhanced.data.local.dao.SearchHistoryDao
import com.sinc.enhanced.data.local.dao.UserLibraryDao
import com.sinc.enhanced.data.local.entity.CacheEntryEntity
import com.sinc.enhanced.data.local.entity.DownloadEntity
import com.sinc.enhanced.data.local.entity.HistoryEntity
import com.sinc.enhanced.data.local.entity.LikedTrackEntity
import com.sinc.enhanced.data.local.entity.LyricsCacheEntity
import com.sinc.enhanced.data.local.entity.PlayCountEntity
import com.sinc.enhanced.data.local.entity.PlaylistEntity
import com.sinc.enhanced.data.local.entity.PlaylistTrackEntity
import com.sinc.enhanced.data.local.entity.SavedTrackEntity
import com.sinc.enhanced.data.local.entity.SearchHistoryEntity
import com.sinc.enhanced.data.local.entity.UserGenreEntity

@Database(
    entities = [DownloadEntity::class, HistoryEntity::class, LikedTrackEntity::class, SavedTrackEntity::class, SearchHistoryEntity::class, PlaylistEntity::class, PlaylistTrackEntity::class, LyricsCacheEntity::class, CacheEntryEntity::class, UserGenreEntity::class, PlayCountEntity::class],
    version = 6,
    exportSchema = true
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun downloadDao(): DownloadDao
    abstract fun historyDao(): HistoryDao
    abstract fun searchHistoryDao(): SearchHistoryDao
    abstract fun playlistDao(): PlaylistDao
    abstract fun userLibraryDao(): UserLibraryDao
    abstract fun lyricsCacheDao(): LyricsCacheDao
    abstract fun cacheDao(): CacheDao
    abstract fun recommendationDao(): RecommendationDao

    companion object {
        val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("CREATE TABLE IF NOT EXISTS search_history (id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, query TEXT NOT NULL, resultType TEXT NOT NULL DEFAULT 'generic', searchedAt INTEGER NOT NULL)")
            }
        }

        val MIGRATION_2_3 = object : Migration(2, 3) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("CREATE TABLE IF NOT EXISTS playlists (id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', artworkUrl TEXT, trackCount INTEGER NOT NULL DEFAULT 0, createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL)")
                db.execSQL("CREATE TABLE IF NOT EXISTS playlist_tracks (id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, playlistId INTEGER NOT NULL, trackId TEXT NOT NULL, title TEXT NOT NULL, artist TEXT NOT NULL, album TEXT NOT NULL DEFAULT '', artworkUrl TEXT, durationMs INTEGER NOT NULL DEFAULT 0, source TEXT NOT NULL DEFAULT 'spotify', filePath TEXT, position INTEGER NOT NULL DEFAULT 0, addedAt INTEGER NOT NULL, FOREIGN KEY (playlistId) REFERENCES playlists(id) ON DELETE CASCADE)")
                db.execSQL("CREATE UNIQUE INDEX IF NOT EXISTS idx_playlist_tracks_unique ON playlist_tracks(playlistId, trackId)")
                db.execSQL("CREATE INDEX IF NOT EXISTS idx_playlist_tracks_playlist ON playlist_tracks(playlistId)")
            }
        }

        val MIGRATION_3_4 = object : Migration(3, 4) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("CREATE TABLE IF NOT EXISTS liked_tracks (id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, trackId TEXT NOT NULL, title TEXT NOT NULL, artist TEXT NOT NULL, album TEXT NOT NULL DEFAULT '', artworkUrl TEXT, durationMs INTEGER NOT NULL DEFAULT 0, source TEXT NOT NULL DEFAULT 'spotify', filePath TEXT, addedAt INTEGER NOT NULL)")
                db.execSQL("CREATE UNIQUE INDEX IF NOT EXISTS idx_liked_tracks_trackId ON liked_tracks(trackId)")
                db.execSQL("CREATE TABLE IF NOT EXISTS saved_tracks (trackId TEXT NOT NULL PRIMARY KEY, title TEXT NOT NULL, artist TEXT NOT NULL, album TEXT NOT NULL DEFAULT '', artworkUrl TEXT, durationMs INTEGER NOT NULL DEFAULT 0, source TEXT NOT NULL DEFAULT 'spotify', filePath TEXT, addedAt INTEGER NOT NULL)")
            }
        }

        val MIGRATION_4_5 = object : Migration(4, 5) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("CREATE TABLE IF NOT EXISTS lyrics_cache (id TEXT PRIMARY KEY, plainLyrics TEXT NOT NULL DEFAULT '', syncedLyrics TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT '')")
                db.execSQL("CREATE TABLE IF NOT EXISTS cache_entries (key TEXT PRIMARY KEY, value TEXT NOT NULL, expiresAt INTEGER NOT NULL DEFAULT 9223372036854775807)")
            }
        }

        val MIGRATION_5_6 = object : Migration(5, 6) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("CREATE TABLE IF NOT EXISTS user_genres (id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, genre TEXT NOT NULL, affinity REAL NOT NULL DEFAULT 1.0, lastInteracted INTEGER NOT NULL)")
                db.execSQL("CREATE UNIQUE INDEX IF NOT EXISTS idx_user_genres_genre ON user_genres(genre)")
                db.execSQL("CREATE TABLE IF NOT EXISTS play_counts (trackId TEXT NOT NULL PRIMARY KEY, artist TEXT NOT NULL, title TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 1, lastPlayed INTEGER NOT NULL)")
                db.execSQL("CREATE UNIQUE INDEX IF NOT EXISTS idx_play_counts_trackId ON play_counts(trackId)")
            }
        }
    }
}
