package com.sinc.enhanced.data.repository

import com.sinc.enhanced.data.local.dao.PlaylistDao
import com.sinc.enhanced.data.local.entity.PlaylistEntity
import com.sinc.enhanced.data.local.entity.PlaylistTrackEntity
import com.sinc.enhanced.data.model.Track
import com.sinc.enhanced.domain.repository.PlaylistRepository as PlaylistRepositoryInterface
import kotlinx.coroutines.flow.Flow

class PlaylistRepository(private val playlistDao: PlaylistDao) : PlaylistRepositoryInterface {

    override val allPlaylists: Flow<List<PlaylistEntity>> = playlistDao.getAllPlaylists()

    override suspend fun create(name: String, description: String): String {
        val now = System.currentTimeMillis()
        val entity = PlaylistEntity(name = name.trim(), description = description.trim(), createdAt = now, updatedAt = now)
        playlistDao.upsertPlaylist(entity)
        return entity.id
    }

    override suspend fun get(id: String): PlaylistEntity? = playlistDao.getPlaylist(id)

    override suspend fun getTracks(playlistId: String): List<PlaylistTrackEntity> {
        return playlistDao.getPlaylistTracks(playlistId)
    }

    override fun getTracksFlow(playlistId: String): Flow<List<PlaylistTrackEntity>> = playlistDao.getPlaylistTracksFlow(playlistId)

    override suspend fun update(playlist: PlaylistEntity) {
        playlistDao.updatePlaylist(playlist)
    }

    override suspend fun addTrack(playlistId: String, track: Track, filePath: String?) {
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

    suspend fun addTrackByEntity(entity: PlaylistTrackEntity) {
        playlistDao.addTrackAndUpdateCount(
            entity.copy(
                position = playlistDao.nextPosition(entity.playlistId),
                addedAt = System.currentTimeMillis()
            )
        )
    }

    override suspend fun removeTrack(playlistId: String, trackId: String) {
        playlistDao.removeTrackByKey(playlistId, trackId)
    }

    override suspend fun reorderTracks(playlistId: String, trackIds: List<String>) {
        playlistDao.reorderTracks(playlistId, trackIds)
    }

    override suspend fun delete(id: String) {
        playlistDao.deletePlaylist(id)
    }

    override suspend fun rename(id: String, name: String) {
        val p = playlistDao.getPlaylist(id) ?: return
        playlistDao.updatePlaylist(p.copy(name = name.trim(), updatedAt = System.currentTimeMillis()))
    }
}
