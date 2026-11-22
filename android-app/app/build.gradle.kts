plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.zagruzchik.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.zagruzchik.app"
        minSdk = 24 // Android 7.0+
        ndk { abiFilters += listOf("arm64-v8a", "armeabi-v7a") }
        targetSdk = 35
        versionCode = 122
        versionName = "9.52"
    }

    // Один постоянный ключ, чтобы новые версии ставились поверх старых без удаления.
    signingConfigs {
        create("app") {
            storeFile = file("signing.jks")
            storePassword = "zagruzchik"
            keyAlias = "zagruzchik"
            keyPassword = "zagruzchik"
        }
    }
    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("app")
        }
        debug {
            signingConfig = signingConfigs.getByName("app")
        }
    }

    // Python и ffmpeg внутри библиотеки должны распаковываться на устройство.
    packaging {
        dex { useLegacyPackaging = true }
        jniLibs { useLegacyPackaging = true }
    }

    compileOptions {
        isCoreLibraryDesugaringEnabled = true // NewPipeExtractor пользуется новыми классами Java
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.recyclerview:recyclerview:1.3.2")
    // Профиль запуска ставится и при установке APK не из магазина: интерфейс и запуск быстрее с первого открытия.
    implementation("androidx.profileinstaller:profileinstaller:1.3.1")
    implementation("androidx.media3:media3-exoplayer:1.4.1")
    implementation("androidx.media3:media3-exoplayer-hls:1.4.1") // потоки SoundCloud и др. (.m3u8)
    implementation("androidx.media3:media3-ui:1.4.1")
    implementation("androidx.media3:media3-session:1.4.1")
    implementation("androidx.media3:media3-cast:1.4.1") // трансляция на ТВ и колонки (Chromecast)
    implementation("androidx.mediarouter:mediarouter:1.7.0") // кнопка трансляции
    implementation("io.github.junkfood02.youtubedl-android:library:0.18.1")
    implementation("io.github.junkfood02.youtubedl-android:ffmpeg:0.18.1")
    implementation("com.github.TeamNewPipe:NewPipeExtractor:v0.27.1") // YouTube Music: поиск песен с исполнителем и длительностью
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs_nio:2.1.5")
    implementation("com.github.tdlibx:td:1.8.56") // Telegram: поиск музыки через свой аккаунт
}
