package com.sinc.enhanced.data.error

sealed class AppError(
    override val message: String,
    override val cause: Throwable? = null
) : Exception(message, cause) {

    // Network errors
    data class NetworkError(
        override val message: String,
        val statusCode: Int? = null,
        override val cause: Throwable? = null
    ) : AppError(message, cause)

    data class TimeoutError(
        override val message: String = "Request timed out",
        val operation: String,
        override val cause: Throwable? = null
    ) : AppError(message, cause)

    data class ConnectionError(
        override val message: String = "Network connection failed",
        override val cause: Throwable? = null
    ) : AppError(message, cause)

    // Authentication/Authorization errors
    data class AuthError(
        override val message: String,
        val requiresLogin: Boolean = false,
        override val cause: Throwable? = null
    ) : AppError(message, cause)

    data class TokenExpiredError(
        override val message: String = "Authentication token expired",
        override val cause: Throwable? = null
    ) : AppError(message, cause)

    data class PermissionDeniedError(
        override val message: String = "Permission denied",
        override val cause: Throwable? = null
    ) : AppError(message, cause)

    // Source/Audio resolution errors
    sealed class SourceError(
        override val message: String,
        open val source: String,
        open val isRetryable: Boolean = true,
        override val cause: Throwable? = null
    ) : AppError(message, cause) {
        data class SourceUnavailable(
            override val message: String,
            override val source: String,
            override val isRetryable: Boolean = true,
            override val cause: Throwable? = null
        ) : SourceError(message, source, isRetryable, cause)

        data class RateLimited(
            override val message: String,
            override val source: String,
            val retryAfterMs: Long? = null,
            override val cause: Throwable? = null
        ) : SourceError(message, source, true, cause)

        data class InvalidResponse(
            override val message: String,
            override val source: String,
            override val cause: Throwable? = null
        ) : SourceError(message, source, false, cause)

        data class NoAudioFound(
            override val message: String,
            override val source: String,
            override val cause: Throwable? = null
        ) : SourceError(message, source, false, cause)

        data class PreviewOnly(
            override val message: String,
            override val source: String,
            override val cause: Throwable? = null
        ) : SourceError(message, source, false, cause)
    }

    // Validation errors
    data class ValidationError(
        override val message: String,
        val field: String? = null,
        override val cause: Throwable? = null
    ) : AppError(message, cause)

    // Storage/File errors
    data class StorageError(
        override val message: String,
        val path: String? = null,
        override val cause: Throwable? = null
    ) : AppError(message, cause)

    data class InsufficientSpaceError(
        override val message: String = "Insufficient storage space",
        val requiredBytes: Long,
        val availableBytes: Long,
        override val cause: Throwable? = null
    ) : AppError(message, cause)

    data class FileNotFoundError(
        override val message: String,
        val path: String,
        override val cause: Throwable? = null
    ) : AppError(message, cause)

    // Database errors
    data class DatabaseError(
        override val message: String,
        val operation: String,
        override val cause: Throwable? = null
    ) : AppError(message, cause)

    // Configuration errors
    data class ConfigurationError(
        override val message: String,
        val missingKey: String? = null,
        override val cause: Throwable? = null
    ) : AppError(message, cause)

    // Unknown/Catch-all
    data class UnknownError(
        override val message: String = "An unknown error occurred",
        override val cause: Throwable? = null
    ) : AppError(message, cause)

    companion object {
        fun fromException(e: Exception, defaultMessage: String = "Operation failed"): AppError {
            return when (e) {
                is AppError -> e
                is java.net.SocketTimeoutException -> TimeoutError("Connection timed out", "network", e)
                is java.net.ConnectException -> ConnectionError("Cannot connect to server", e)
                is java.io.IOException -> NetworkError("Network error: ${e.message}", cause = e)
                is java.lang.IllegalArgumentException -> ValidationError(e.message ?: defaultMessage, cause = e)
                is java.lang.IllegalStateException -> ConfigurationError(e.message ?: defaultMessage, cause = e)
                else -> UnknownError(e.message ?: defaultMessage, e)
            }
        }
    }
}