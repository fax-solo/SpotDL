plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.ksp)
}

android {
    namespace = "com.sinc.enhanced"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.sinc.enhanced"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "1.0.0"

        buildConfigField("String", "SPOTIFY_CLIENT_ID", "\"${project.findProperty("SPOTIFY_CLIENT_ID") ?: "YOUR_SPOTIFY_CLIENT_ID"}\"")
        buildConfigField("String", "SPOTIFY_CLIENT_SECRET", "\"${project.findProperty("SPOTIFY_CLIENT_SECRET") ?: "YOUR_SPOTIFY_CLIENT_SECRET"}\"")
        buildConfigField("String", "BACKEND_URL", "\"${project.findProperty("BACKEND_URL") ?: ""}\"")
    }

    signingConfigs {
        create("release") {
            storeFile = file(System.getenv("ENHANCED_RELEASE_KEYSTORE_PATH") ?: "release.keystore")
            storePassword = System.getenv("ENHANCED_RELEASE_KEYSTORE_PASSWORD") ?: ""
            keyAlias = System.getenv("ENHANCED_RELEASE_KEY_ALIAS") ?: ""
            keyPassword = System.getenv("ENHANCED_RELEASE_KEY_PASSWORD") ?: ""
        }
    }

    buildTypes {
        debug {
            isMinifyEnabled = false
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            signingConfig = signingConfigs.getByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)

    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.ui.graphics)
    implementation(libs.compose.ui.tooling.preview)
    implementation(libs.compose.material3)
    implementation(libs.compose.material.icons)

    implementation(libs.navigation.compose)

    implementation(libs.lifecycle.runtime.compose)
    implementation(libs.lifecycle.viewmodel.compose)

    implementation(libs.room.runtime)
    implementation(libs.room.ktx)
    ksp(libs.room.compiler)

    implementation(libs.okhttp)
    implementation(libs.okhttp.logging)

    implementation(libs.media3.exoplayer)
    implementation(libs.media3.session)

    implementation(libs.coil.compose)

    implementation(libs.datastore.preferences)

    implementation(libs.kotlinx.coroutines.android)

    implementation(libs.newpipe.extractor)

    debugImplementation(libs.compose.ui.tooling)
}
