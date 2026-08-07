package com.sinc.enhanced.data.util

/**
 * Waveform-as-structure generators. The algorithm mirrors the TS side
 * (frontend/src/lib/waveform.ts) 1:1 so both platforms render the same
 * per-track shape from a track id. Int arithmetic wraps on overflow, which is
 * the exact same semantics as JS `Math.imul` for the low 32 bits.
 */

/** FNV-1a 32-bit hash — stable String -> 32-bit seed (matches `hashTrackId`). */
fun hashTrackId(id: String): Int {
    var h = 0x811c9dc5.toInt()
    for (i in id.indices) {
        h = h xor id[i].code
        h = h * 0x01000193
    }
    return h
}

/** Mulberry32 PRNG — returns [0.0, 1.0). Matches the TS `mulberry32`. */
fun mulberry32(seed: Int): () -> Double {
    var a = seed
    return {
        a += 0x6d2b79f5
        var t = (a xor (a ushr 15)) * (1 or a)
        t = (t + ((t xor (t ushr 7)) * (61 or t))) xor t
        (t xor (t ushr 14)).toUInt().toDouble() / 4294967296.0
    }
}

/** Deterministic bar amplitudes (0.08..1.0). Mirrors `generateWaveform`. */
fun generateWaveform(trackId: String, bars: Int): FloatArray {
    if (bars <= 0) return FloatArray(0)
    val rand = mulberry32(hashTrackId(trackId))
    return FloatArray(bars) { i ->
        val t = if (bars == 1) 0.5f else i.toFloat() / (bars - 1)
        val envelope = kotlin.math.sin(Math.PI * t).toFloat()
        val base = 0.18f + 0.62f * envelope
        val n = 1f - rand().toFloat() * 0.6f
        val v = base * n * (0.5f + rand().toFloat() * 0.5f)
        v.coerceIn(0.08f, 1f)
    }
}

/** Static "listening" loading bars for resolving/connecting states. */
fun loadingWaveform(bars: Int): FloatArray {
    return FloatArray(bars) { i ->
        val t = if (bars == 1) 0.5f else i.toFloat() / (bars - 1)
        0.25f + 0.65f * kotlin.math.sin(Math.PI * t).toFloat()
    }
}
