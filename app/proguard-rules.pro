-keep class com.sinc.enhanced.** { *; }

-keep class org.schabi.newpipe.** { *; }
-dontwarn org.schabi.newpipe.**

-keep class com.google.gson.** { *; }
-keepattributes Signature
-keepattributes *Annotation*

-dontwarn okhttp3.internal.**
-dontwarn org.bouncycastle.**
-dontwarn org.conscrypt.**
-dontwarn org.openjsse.**

-keep class androidx.room.** { *; }
