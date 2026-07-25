package com.sinc.enhanced.ui.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import com.sinc.enhanced.R
import com.sinc.enhanced.service.MediaPlaybackService

class PlayerWidgetProvider : AppWidgetProvider() {
    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        for (appWidgetId in appWidgetIds) {
            val views = RemoteViews(context.packageName, R.layout.player_widget)
            val playIntent = Intent(context, MediaPlaybackService::class.java).apply { action = "PLAY_PAUSE" }
            views.setOnClickPendingIntent(R.id.widget_play_pause, PendingIntent.getService(context, 0, playIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
            val prevIntent = Intent(context, MediaPlaybackService::class.java).apply { action = "SKIP_PREVIOUS" }
            views.setOnClickPendingIntent(R.id.widget_prev, PendingIntent.getService(context, 1, prevIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
            val nextIntent = Intent(context, MediaPlaybackService::class.java).apply { action = "SKIP_NEXT" }
            views.setOnClickPendingIntent(R.id.widget_next, PendingIntent.getService(context, 2, nextIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
            appWidgetManager.updateAppWidget(appWidgetId, views)
        }
    }
}
