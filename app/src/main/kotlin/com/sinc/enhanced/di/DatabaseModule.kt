package com.sinc.enhanced.di

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.preferencesDataStore
import androidx.room.Room
import com.sinc.enhanced.data.local.AppDatabase
import com.sinc.enhanced.data.local.CacheManager
import com.sinc.enhanced.data.local.SettingsManager
import com.sinc.enhanced.data.util.ConnectivityMonitor

private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "settings")

class DatabaseModule(private val context: Context) {
    val database: AppDatabase = Room.databaseBuilder(
        context,
        AppDatabase::class.java,
        "sinc-enhanced.db"
    ).addMigrations(
        AppDatabase.MIGRATION_1_2,
        AppDatabase.MIGRATION_2_3,
        AppDatabase.MIGRATION_3_4,
        AppDatabase.MIGRATION_4_5,
        AppDatabase.MIGRATION_5_6
    ).build()

    val dataStore: DataStore<Preferences> = context.dataStore

    val settingsManager: SettingsManager = SettingsManager(dataStore)

    val connectivityMonitor: ConnectivityMonitor = ConnectivityMonitor(context)

    val cacheManager: CacheManager = CacheManager(database.cacheDao())
}
