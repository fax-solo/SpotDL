package com.sinc.enhanced.data.auth

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

class EncryptedTokenStore(context: Context) : TokenStore {
    private val prefs: SharedPreferences by lazy {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        EncryptedSharedPreferences.create(
            context,
            ENCRYPTED_PREFS_NAME,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    }

    override fun getToken(): String = prefs.getString(KEY_TOKEN, "") ?: ""
    override fun getRole(): String = prefs.getString(KEY_ROLE, "") ?: ""
    override fun getTokenSavedAt(): Long = prefs.getLong(KEY_TOKEN_SAVED_AT, 0L)

    override fun saveAuth(token: String, role: String) {
        prefs.edit()
            .putString(KEY_TOKEN, token)
            .putString(KEY_ROLE, role)
            .putLong(KEY_TOKEN_SAVED_AT, System.currentTimeMillis())
            .apply()
    }

    override fun clear() {
        prefs.edit()
            .remove(KEY_TOKEN)
            .remove(KEY_ROLE)
            .remove(KEY_TOKEN_SAVED_AT)
            .apply()
    }

    private companion object {
        const val ENCRYPTED_PREFS_NAME = "sinc_auth_secure"
        const val KEY_TOKEN = "auth_token"
        const val KEY_ROLE = "auth_role"
        const val KEY_TOKEN_SAVED_AT = "auth_token_saved_at"
    }
}
