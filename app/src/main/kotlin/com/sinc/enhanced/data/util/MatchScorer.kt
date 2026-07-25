package com.sinc.enhanced.data.util

object MatchScorer {
    const val MIN_CONFIDENCE = 0.3f
    const val GOOD_CONFIDENCE = 0.6f

    private val BRACKET_CONTENT = Regex("\\([^)]*\\)|\\[[^\\]]*\\]|<[^>]*>")
    private val NON_WORD = Regex("[^\\p{L}\\p{N}\\s]")
    private val MULTI_SPACE = Regex("\\s+")
    private val NOISE_WORDS = Regex(
        "\\b(feat|ft|featuring|remastered|remaster|expanded|deluxe|explicit|live|anniversary|version|edit|mix|radio\\s*edit|mono|stereo|audio|official|video|lyric|lyrics|hq|hd|4k|1080p|60fps|visualizer|official\\s*audio|official\\s*video|official\\s*lyric|music\\s*video|lyric\\s*video|full\\s*album|single|album\\s*version|extended|short|short\\s*version)\\b",
        RegexOption.IGNORE_CASE
    )
    private val TOPIC_SUFFIX = Regex("\\s*-\\s*Topic\\s*$", RegexOption.IGNORE_CASE)

    data class MatchOptions(
        val expectedTitle: String,
        val expectedArtist: String,
        val foundTitle: String,
        val foundAuthor: String = "",
        val foundDurationSec: Long? = null,
        val expectedDurationSec: Long? = null,
        val expectedIsrc: String? = null,
        val foundIsrc: String? = null
    )

    fun normalize(s: String): String {
        return s
            .replace(BRACKET_CONTENT, " ")
            .replace(NON_WORD, " ")
            .replace(NOISE_WORDS, " ")
            .replace(MULTI_SPACE, " ")
            .trim()
            .lowercase()
    }

    fun stripQueryNoise(s: String): String {
        return s
            .replace(BRACKET_CONTENT, " ")
            .replace(NOISE_WORDS, " ")
            .replace(MULTI_SPACE, " ")
            .trim()
    }

    private fun tokenize(s: String): Set<String> {
        return s.split(Regex("\\s+")).filter { it.length > 1 }.toSet()
    }

    private fun splitMultiArtist(s: String): List<String> {
        return s.split(Regex("\\s*[,&/]\\s*|\\s+x\\s+|\\s+vs\\.?\\s+")).map { it.trim() }.filter { it.isNotEmpty() }
    }

    private fun tokenJaccard(a: Set<String>, b: Set<String>): Double {
        val common = a.count { it in b }
        val union = a.size + b.size - common
        return if (union > 0) common.toDouble() / union else 0.0
    }

    fun computeScore(options: MatchOptions): Float {
        val t = normalize(options.expectedTitle)
        val aParts = splitMultiArtist(normalize(options.expectedArtist))
        val ftNorm = normalize(options.foundTitle)
        val faNorm = normalize(options.foundAuthor)

        if (t.isEmpty()) return 0f

        var score = 0.0
        var total = 0.0

        val tTokens = tokenize(options.expectedTitle.lowercase())
        val ftTokens = tokenize(options.foundTitle.lowercase())
        val aTokens = mutableSetOf<String>()
        for (part in aParts) {
            aTokens.addAll(tokenize(part))
        }
        val faTokens = tokenize(options.foundAuthor.lowercase())

        total += 4.0
        when {
            t == ftNorm -> score += 4.0
            t.contains(ftNorm) || ftNorm.contains(t) -> score += 3.5
            tTokens.isNotEmpty() && ftTokens.isNotEmpty() -> {
                val jaccard = tokenJaccard(tTokens, ftTokens)
                score += when {
                    jaccard >= 0.6 -> 4.0
                    jaccard >= 0.4 -> 3.0
                    jaccard >= 0.25 -> 2.0
                    jaccard >= 0.1 -> 1.0
                    else -> 0.5
                }
            }
        }

        if (aParts.isNotEmpty() && aParts.any { it.isNotEmpty() }) {
            total += 3.0
            var authorScore = 0.0

            if (faTokens.isNotEmpty() && aTokens.isNotEmpty()) {
                val jaccard = tokenJaccard(aTokens, faTokens)
                authorScore = when {
                    jaccard >= 0.8 -> 3.0
                    jaccard >= 0.5 -> 2.0
                    jaccard > 0 -> 1.0
                    else -> 0.0
                }
            }

            var titleAuthorScore = 0.0
            if (ftTokens.isNotEmpty() && aTokens.isNotEmpty()) {
                val common = aTokens.count { it in ftTokens }
                if (common == aTokens.size && aTokens.isNotEmpty()) titleAuthorScore = 2.0
                else if (common > 0) titleAuthorScore = 1.0
            }

            val normEa = normalize(options.expectedArtist)
            when {
                faNorm == normEa -> authorScore = 3.0
                normEa.length >= 3 && (faNorm.contains(normEa) || normEa.contains(faNorm)) -> authorScore = maxOf(authorScore, 2.5)
            }

            score += maxOf(authorScore, titleAuthorScore)
        }

        val expSec = options.expectedDurationSec
        val foundSec = options.foundDurationSec
        if (expSec != null && foundSec != null && expSec > 0 && foundSec > 0) {
            total += 2.0
            val ratio = minOf(expSec, foundSec).toDouble() / maxOf(expSec, foundSec).toDouble()
            score += when {
                ratio >= 0.9 -> 2.0
                ratio >= 0.7 -> 1.5
                ratio >= 0.5 -> 1.0
                ratio >= 0.3 -> 0.5
                else -> 0.0
            }
        }

        if (options.expectedIsrc != null && options.foundIsrc != null &&
            options.expectedIsrc.equals(options.foundIsrc, ignoreCase = true)
        ) {
            score += 10.0
            total += 10.0
        }

        if (options.foundAuthor.isNotEmpty() && TOPIC_SUFFIX.containsMatchIn(options.foundAuthor)) {
            score += 1.0
            total += 1.0
        }

        return if (total > 0) (score / total).toFloat() else 0f
    }
}
