package com.sinc.enhanced.data.repository

import com.sinc.enhanced.data.local.dao.PlaylistDao
import com.sinc.enhanced.data.local.dao.UserLibraryDao
import com.sinc.enhanced.data.local.entity.LikedTrackEntity
import com.sinc.enhanced.data.local.entity.SavedTrackEntity
import com.sinc.enhanced.data.model.Track
import com.sinc.enhanced.domain.repository.UserLibraryRepository as UserLibraryRepositoryInterface
import kotlinx.coroutines.flow.Flow

class UserLibraryRepository(
    private val userLibraryDao: UserLibraryDao,
    private val playlistDao: PlaylistDao
) : UserLibraryRepositoryInterface {

    override val allLikedTracks: Flow<List<LikedTrackEntity>> = userLibraryDao.getAllLikedTracks()
    override val allSavedTracks: Flow<List<SavedTrackEntity>> = userLibraryDao.getAllSavedTracks()

    override suspend fun isTrackLiked(trackId: String): Boolean = userLibraryDao.isTrackLiked(trackId)

    override suspend fun likeTrack(track: Track, filePath: String?) {
        userLibraryDao.insertLikedTrack(
            LikedTrackEntity(
                trackId = track.id,
                title = track.title,
                artist = track.artist,
                album = track.album,
                artworkUrl = track.artworkUrl,
                durationMs = track.durationMs,
                source = track.source,
                filePath = filePath
            )
        )
    }

    override suspend fun unlikeTrack(trackId: String) {
        userLibraryDao.removeLikedTrack(trackId)
    }

    override suspend fun isTrackSaved(trackId: String): Boolean = userLibraryDao.isTrackSaved(trackId)

    override suspend fun saveTrack(track: Track, filePath: String?) {
        userLibraryDao.saveTrack(
            SavedTrackEntity(
                trackId = track.id,
                title = track.title,
                artist = track.artist,
                album = track.album,
                artworkUrl = track.artworkUrl,
                durationMs = track.durationMs,
                source = track.source,
                filePath = filePath
            )
        )
    }

    override suspend fun unsaveTrack(trackId: String) {
        userLibraryDao.unsaveTrack(trackId)
    }

    override suspend fun addToRecentlyPlayed(track: Track, filePath: String?) {
        userLibraryDao.insertHistory(
            com.sinc.enhanced.data.local.entity.HistoryEntity(
                trackId = track.id,
                title = track.title,
                artist = track.artist,
                album = track.album,
                artworkUrl = track.artworkUrl,
                durationMs = track.durationMs,
                source = track.source,
                filePath = filePath
            )
        )
    }

    override suspend fun getRecentlyPlayed(limit: Int): List<com.sinc.enhanced.data.local.entity.HistoryEntity> =
        userLibraryDao.getRecentlyPlayed().take(limit)

    override suspend fun addTrackToPlaylist(playlistId: Int, track: Track, filePath: String?) {
        val position = playlistDao.nextPosition(playlistId)
        playlistDao.addTrackAndUpdateCount(
            com.sinc.enhanced.data.local.entity.PlaylistTrackEntity(
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

    override suspend fun removeTrackFromPlaylist(playlistId: Int, trackId: String) {
        playlistDao.removeTrackByKey(playlistId, trackId)
    }

    override suspend fun reorderPlaylistTracks(playlistId: Int, fromIndex: Int, toIndex: Int) {
        val tracks = playlistDao.getPlaylistTracks(playlistId).toMutableList()
        if (fromIndex !in tracks.indices || toIndex !in tracks.indices) return
        val track = tracks.removeAt(fromIndex)
        tracks.add(toIndex, track)
        playlistDao.reorderByIndices(tracks)
    }
}