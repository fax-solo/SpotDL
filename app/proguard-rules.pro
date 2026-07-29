-keep class com.sinc.enhanced.** { *; }

-keepattributes Signature
-keepattributes *Annotation*

-dontwarn okhttp3.internal.**
-dontwarn org.bouncycastle.**
-dontwarn org.conscrypt.**
-dontwarn org.openjsse.**

-keep class androidx.room.** { *; }
