package com.sinc.enhanced.data.auth

interface TokenStore {
    fun getToken(): String
    fun getRole(): String
    fun getTokenSavedAt(): Long
    fun saveAuth(token: String, role: String)
    fun clear()
}
