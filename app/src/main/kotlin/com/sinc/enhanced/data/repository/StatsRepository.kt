package com.sinc.enhanced.data.repository

import com.sinc.enhanced.data.local.dao.DownloadDao
import com.sinc.enhanced.data.local.dao.HistoryDao
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.util.Calendar

class StatsRepository(
    private val downloadDao: DownloadDao,
    private val historyDao: HistoryDao
) {

    data class AppStats(
        val totalDownloads: Int,
        val downloadsThisMonth: Int,
        val downloadsThisYear: Int,
        val totalHistoryItems: Int,
        val historyThisMonth: Int,
        val historyThisYear: Int,
        val bySource: List<DownloadDao.SourceCount>
    )

    suspend fun getStats(): AppStats = withContext(Dispatchers.IO) {
        val now = Calendar.getInstance()

        val startOfMonth = Calendar.getInstance().apply {
            set(Calendar.DAY_OF_MONTH, 1)
            set(Calendar.HOUR_OF_DAY, 0)
            set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }.timeInMillis

        val startOfYear = Calendar.getInstance().apply {
            set(Calendar.MONTH, Calendar.JANUARY)
            set(Calendar.DAY_OF_MONTH, 1)
            set(Calendar.HOUR_OF_DAY, 0)
            set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }.timeInMillis

        AppStats(
            totalDownloads = downloadDao.totalCompleted(),
            downloadsThisMonth = downloadDao.completedSince(startOfMonth),
            downloadsThisYear = downloadDao.completedSince(startOfYear),
            totalHistoryItems = historyDao.totalCount(),
            historyThisMonth = historyDao.countSince(startOfMonth),
            historyThisYear = historyDao.countSince(startOfYear),
            bySource = downloadDao.completedBySource()
        )
    }
}
