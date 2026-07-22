package com.sinc.enhanced.data.local

import androidx.room.Database
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
import com.sinc.enhanced.data.local.dao.DownloadDao
import com.sinc.enhanced.data.local.dao.HistoryDao
import com.sinc.enhanced.data.local.dao.PlaylistDao
import com.sinc.enhanced.data.local.dao.SearchHistoryDao
import com.sinc.enhanced.data.local.entity.DownloadEntity
import com.sinc.enhanced.data.local.entity.HistoryEntity
import com.sinc.enhanced.data.local.entity.PlaylistEntity
import com.sinc.enhanced.data.local.entity.PlaylistTrackEntity
import com.sinc.enhanced.data.local.entity.SearchHistoryEntity

@Database(
    entities = [DownloadEntity::class, HistoryEntity::class, SearchHistoryEntity::class, PlaylistEntity::class, PlaylistTrackEntity::class],
    version = 3,
    exportSchema = false
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun downloadDao(): DownloadDao
    abstract fun historyDao(): HistoryDao
    abstract fun searchHistoryDao(): SearchHistoryDao
    abstract fun playlistDao(): PlaylistDao

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
    }
}
