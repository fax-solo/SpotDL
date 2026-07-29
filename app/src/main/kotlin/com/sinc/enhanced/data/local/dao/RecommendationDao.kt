package com.sinc.enhanced.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.sinc.enhanced.data.local.entity.PlayCountEntity
import com.sinc.enhanced.data.local.entity.UserGenreEntity

@Dao
interface RecommendationDao {

    @Query("""
        INSERT INTO user_genres (genre, affinity, lastInteracted)
        VALUES (:genre, :affinity, :now)
        ON CONFLICT(genre) DO UPDATE SET
            affinity = MIN(1.0, affinity + :affinity * 0.1),
            lastInteracted = :now
    """)
    suspend fun recordGenreInteraction(genre: String, affinity: Float, now: Long = System.currentTimeMillis())

    @Query("SELECT * FROM user_genres ORDER BY affinity DESC LIMIT 20")
    suspend fun getTopGenres(): List<UserGenreEntity>

    @Query("SELECT genre FROM user_genres ORDER BY affinity DESC LIMIT 10")
    suspend fun getTopGenreNames(): List<String>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun recordPlay(count: PlayCountEntity)

    @Query("""
        INSERT INTO play_counts (trackId, artist, title, count, lastPlayed)
        VALUES (:trackId, :artist, :title, 1, :now)
        ON CONFLICT(trackId) DO UPDATE SET
            count = count + 1,
            lastPlayed = :now
    """)
    suspend fun incrementPlayCount(trackId: String, artist: String, title: String, now: Long = System.currentTimeMillis())

    @Query("SELECT DISTINCT artist FROM play_counts ORDER BY (SELECT SUM(p2.count) FROM play_counts p2 WHERE p2.artist = play_counts.artist) DESC LIMIT 20")
    suspend fun getTopArtists(): List<String>

    @Query("SELECT COUNT(*) FROM play_counts")
    suspend fun getTotalPlays(): Int

    @Query("DELETE FROM user_genres")
    suspend fun clearGenres()

    @Query("DELETE FROM play_counts")
    suspend fun clearPlayCounts()
}
