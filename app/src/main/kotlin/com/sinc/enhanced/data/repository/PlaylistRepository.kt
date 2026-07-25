package com.sinc.enhanced.data.repository

import com.sinc.enhanced.data.local.dao.PlaylistDao
import com.sinc.enhanced.data.local.entity.PlaylistEntity
import com.sinc.enhanced.data.local.entity.PlaylistTrackEntity
import com.sinc.enhanced.data.model.Track
import com.sinc.enhanced.domain.repository.PlaylistRepository as PlaylistRepositoryInterface
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.withContext

class PlaylistRepository(private val playlistDao: PlaylistDao) : PlaylistRepositoryInterface {

    override val allPlaylists: Flow<List<PlaylistEntity>> = playlistDao.getAllPlaylists()

    override suspend fun create(name: String, description: String): Int = withContext(Dispatchers.IO) {
        val now = System.currentTimeMillis()
        playlistDao.upsertPlaylist(
            PlaylistEntity(name = name.trim(), description = description.trim(), createdAt = now, updatedAt = now)
        ).toInt()
    }

    override suspend fun get(id: Int): PlaylistEntity? = playlistDao.getPlaylist(id)

    override suspend fun getTracks(playlistId: Int): List<PlaylistTrackEntity> = withContext(Dispatchers.IO) {
        playlistDao.getPlaylistTracks(playlistId)
    }

    override fun getTracksFlow(playlistId: Int): Flow<List<PlaylistTrackEntity>> = playlistDao.getPlaylistTracksFlow(playlistId)

    override suspend fun update(playlist: PlaylistEntity) = withContext(Dispatchers.IO) {
        playlistDao.updatePlaylist(playlist)
    }

    override suspend fun addTrack(playlistId: Int, track: Track, filePath: String?) = withContext(Dispatchers.IO) {
        val position = playlistDao.nextPosition(playlistId)
        playlistDao.addTrackAndUpdateCount(
            PlaylistTrackEntity(
                playlistId = playlistId,
                trackId = track.id,
                title = track.title,
                artist = track.artist,
                album = track.album,
                artworkUrl = track.artworkUrl,
                durationMs = track.durationMs,
                source = track.source,
                filePath = filePath,
                position = position,
                addedAt = System.currentTimeMillis()
            )
        )
    }

    suspend fun addTrackByEntity(entity: PlaylistTrackEntity) = withContext(Dispatchers.IO) {
        playlistDao.addTrackAndUpdateCount(
            entity.copy(
                position = playlistDao.nextPosition(entity.playlistId),
                addedAt = System.currentTimeMillis()
            )
        )
    }

    override suspend fun removeTrack(playlistId: Int, trackId: String) = withContext(Dispatchers.IO) {
        playlistDao.removeTrackByKey(playlistId, trackId)
    }

    override suspend fun reorderTracks(playlistId: Int, trackIds: List<String>) = withContext(Dispatchers.IO) {
        val tracks = playlistDao.getPlaylistTracks(playlistId)
        tracks.forEach { entity ->
            val newPos = trackIds.indexOf(entity.trackId)
            if (newPos >= 0 && newPos != entity.position) {
                playlistDao.updateTrackPosition(entity.id, newPos)
            }
        }
    }

    override suspend fun delete(id: Int) = withContext(Dispatchers.IO) {
        playlistDao.deletePlaylist(id)
    }

    override suspend fun rename(id: Int, name: String) = withContext(Dispatchers.IO) {
        val p = playlistDao.getPlaylist(id) ?: return@withContext
        playlistDao.updatePlaylist(p.copy(name = name.trim(), updatedAt = System.currentTimeMillis()))
    }
}
