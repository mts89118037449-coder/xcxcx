plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.zagruzchik.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.zagruzchik.app"
        minSdk = 29 // Android 10+
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"
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

    // Отдельные APK под процессоры: arm64 — почти все телефоны с 2017 года, armeabi-v7a — старые.
    splits {
        abi {
            isEnable = true
            reset()
            include("arm64-v8a", "armeabi-v7a")
            isUniversalApk = false
        }
    }

    // Python и ffmpeg внутри библиотеки должны распаковываться на устройство.
    packaging {
        jniLibs { useLegacyPackaging = true }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation("io.github.junkfood02.youtubedl-android:library:0.18.1")
    implementation("io.github.junkfood02.youtubedl-android:ffmpeg:0.18.1")
}
