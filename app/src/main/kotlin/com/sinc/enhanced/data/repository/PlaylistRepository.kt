package com.sinc.enhanced.data.repository

import com.sinc.enhanced.data.local.dao.PlaylistDao
import com.sinc.enhanced.data.local.entity.PlaylistEntity
import com.sinc.enhanced.data.local.entity.PlaylistTrackEntity
import com.sinc.enhanced.data.model.Track
import com.sinc.enhanced.domain.repository.PlaylistRepository as PlaylistRepositoryInterface
import kotlinx.coroutines.flow.Flow

class PlaylistRepository(private val playlistDao: PlaylistDao) : PlaylistRepositoryInterface {

    override val allPlaylists: Flow<List<PlaylistEntity>> = playlistDao.getAllPlaylists()

    override suspend fun create(name: String, description: String): Int {
        val now = System.currentTimeMillis()
        return playlistDao.upsertPlaylist(
            PlaylistEntity(name = name.trim(), description = description.trim(), createdAt = now, updatedAt = now)
        ).toInt()
    }

    override suspend fun get(id: Int): PlaylistEntity? = playlistDao.getPlaylist(id)

    override suspend fun getTracks(playlistId: Int): List<PlaylistTrackEntity> {
        return playlistDao.getPlaylistTracks(playlistId)
    }

    override fun getTracksFlow(playlistId: Int): Flow<List<PlaylistTrackEntity>> = playlistDao.getPlaylistTracksFlow(playlistId)

    override suspend fun update(playlist: PlaylistEntity) {
        playlistDao.updatePlaylist(playlist)
    }

    override suspend fun addTrack(playlistId: Int, track: Track, filePath: String?) {
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

    override suspend fun removeTrack(playlistId: Int, trackId: String) {
        playlistDao.removeTrackByKey(playlistId, trackId)
    }

    override suspend fun reorderTracks(playlistId: Int, trackIds: List<String>) {
        playlistDao.reorderTracks(playlistId, trackIds)
    }

    override suspend fun delete(id: Int) {
        playlistDao.deletePlaylist(id)
    }

    override suspend fun rename(id: Int, name: String) {
        val p = playlistDao.getPlaylist(id) ?: return
        playlistDao.updatePlaylist(p.copy(name = name.trim(), updatedAt = System.currentTimeMillis()))
    }
}
