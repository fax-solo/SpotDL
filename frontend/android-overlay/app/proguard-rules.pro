# Keep Capacitor bridge classes — used via reflection
-keep class com.getcapacitor.** { *; }
-keep class com.getcapacitor.plugin.** { *; }
-keep class com.getcapacitor.annotation.** { *; }

# Keep custom SpotDL plugin and all its inner classes
-keep class com.spotdl.plugin.** { *; }

# Keep AndroidX media/compat classes used by MediaService
-keep class android.support.v4.media.** { *; }
-keep class androidx.media.** { *; }
-keep class androidx.media.app.** { *; }

# Keep JSObject / JSON serialization used in Capacitor plugin methods
-keep class com.getcapacitor.JSObject { *; }
-keep class org.json.** { *; }

# Keep WebView JavaScript interface (if any)
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Keep R8 from stripping generic signatures (needed for some reflection)
-keepattributes Signature,InnerClasses,EnclosingMethod

# Keep line numbers for crash stack traces
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
