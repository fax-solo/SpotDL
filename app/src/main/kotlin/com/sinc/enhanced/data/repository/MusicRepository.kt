package com.sinc.enhanced.data.repository

import android.content.Context
import android.provider.MediaStore
import com.sinc.enhanced.data.model.Track

class MusicRepository(private val context: Context) {

    data class LocalTrack(
        val id: Long,
        val title: String,
        val artist: String,
        val album: String,
        val durationMs: Long,
        val filePath: String,
        val fileSize: Long,
        val albumArtUri: String? = null
    )

    fun scanLocalMusic(): List<LocalTrack> {
        val tracks = mutableListOf<LocalTrack>()
        val projection = arrayOf(
            MediaStore.Audio.Media._ID,
            MediaStore.Audio.Media.TITLE,
            MediaStore.Audio.Media.ARTIST,
            MediaStore.Audio.Media.ALBUM,
            MediaStore.Audio.Media.DURATION,
            MediaStore.Audio.Media.DATA,
            MediaStore.Audio.Media.SIZE,
            MediaStore.Audio.Media.ALBUM_ID
        )
        val selection = "${MediaStore.Audio.Media.IS_MUSIC} != 0"
        val cursor = context.contentResolver.query(
            MediaStore.Audio.Media.EXTERNAL_CONTENT_URI,
            projection,
            selection,
            null,
            "${MediaStore.Audio.Media.TITLE} ASC"
        )
        cursor?.use {
            val idCol = it.getColumnIndex(MediaStore.Audio.Media._ID)
            val titleCol = it.getColumnIndex(MediaStore.Audio.Media.TITLE)
            val artistCol = it.getColumnIndex(MediaStore.Audio.Media.ARTIST)
            val albumCol = it.getColumnIndex(MediaStore.Audio.Media.ALBUM)
            val durationCol = it.getColumnIndex(MediaStore.Audio.Media.DURATION)
            val dataCol = it.getColumnIndex(MediaStore.Audio.Media.DATA)
            val sizeCol = it.getColumnIndex(MediaStore.Audio.Media.SIZE)
            val albumIdCol = it.getColumnIndex(MediaStore.Audio.Media.ALBUM_ID)

            while (it.moveToNext()) {
                val albumId = if (albumIdCol >= 0) it.getLong(albumIdCol) else -1L
                val albumArtUri = if (albumId >= 0) {
                    "content://media/external/audio/albumart/$albumId"
                } else null

                tracks.add(
                    LocalTrack(
                        id = if (idCol >= 0) it.getLong(idCol) else 0,
                        title = if (titleCol >= 0) it.getString(titleCol) ?: "Unknown" else "Unknown",
                        artist = if (artistCol >= 0) it.getString(artistCol) ?: "Unknown" else "Unknown",
                        album = if (albumCol >= 0) it.getString(albumCol) ?: "Unknown" else "Unknown",
                        durationMs = if (durationCol >= 0) it.getLong(durationCol) else 0,
                        filePath = if (dataCol >= 0) it.getString(dataCol) ?: "" else "",
                        fileSize = if (sizeCol >= 0) it.getLong(sizeCol) else 0,
                        albumArtUri = albumArtUri
                    )
                )
            }
        }
        return tracks
    }

    fun getTrackCount(): Int {
        val cursor = context.contentResolver.query(
            MediaStore.Audio.Media.EXTERNAL_CONTENT_URI,
            arrayOf("COUNT(*)"),
            "${MediaStore.Audio.Media.IS_MUSIC} != 0",
            null,
            null
        )
        return cursor?.use {
            it.moveToFirst()
            it.getInt(0)
        } ?: 0
    }
}
