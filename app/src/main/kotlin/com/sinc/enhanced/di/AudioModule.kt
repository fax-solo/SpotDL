package com.sinc.enhanced.di

import com.sinc.enhanced.data.audio.AudioResolverPipeline
import com.sinc.enhanced.data.audio.AudiusAudioResolver
import com.sinc.enhanced.data.audio.FmaAudioResolver
import com.sinc.enhanced.data.audio.JamendoAudioResolver
import com.sinc.enhanced.data.audio.PipedAudioResolver
import com.sinc.enhanced.data.audio.YtDlpAudioResolver

class AudioModule(clients: ClientModule) {
    val audioPipeline: AudioResolverPipeline = AudioResolverPipeline(
        resolvers = listOf(
            PipedAudioResolver(clients.pipedClient),
            AudiusAudioResolver(clients.audiusClient),
            JamendoAudioResolver(clients.jamendoClient),
            FmaAudioResolver(clients.fmaClient),
            YtDlpAudioResolver()
        ),
        overallTimeoutMs = 6000L
    )
}
