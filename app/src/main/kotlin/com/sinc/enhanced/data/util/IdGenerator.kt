package com.sinc.enhanced.data.util

import java.util.UUID

object IdGenerator {
    fun generate(): String = UUID.randomUUID().toString()
    
    fun generateWithPrefix(prefix: String): String = "${prefix}_${UUID.randomUUID()}"
}