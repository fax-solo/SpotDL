package com.sinc.enhanced.di

import android.content.Context
import com.sinc.enhanced.player.MusicPlayer

class PlayerModule(context: Context) {
    val musicPlayer: MusicPlayer = MusicPlayer(context)
}
