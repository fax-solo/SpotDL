package com.sinc.enhanced.di

import okhttp3.ConnectionPool
import okhttp3.OkHttpClient
import java.util.concurrent.TimeUnit

class NetworkModule {
    private val defaultPool = ConnectionPool(10, 30, TimeUnit.SECONDS)

    val okHttpClient: OkHttpClient = OkHttpClient.Builder()
        .connectionPool(defaultPool)
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .writeTimeout(15, TimeUnit.SECONDS)
        .build()

    val probeClient: OkHttpClient = OkHttpClient.Builder()
        .connectionPool(defaultPool)
        .connectTimeout(5, TimeUnit.SECONDS)
        .readTimeout(5, TimeUnit.SECONDS)
        .writeTimeout(5, TimeUnit.SECONDS)
        .build()

    val downloadClient: OkHttpClient = OkHttpClient.Builder()
        .connectionPool(ConnectionPool(8, 60, TimeUnit.SECONDS))
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(120, TimeUnit.SECONDS)
        .writeTimeout(120, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .build()
}
