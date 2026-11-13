pluginManagement {
    repositories {
        google()
        // Зеркало Maven Central от Google: не упирается в лимиты запросов.
        maven("https://maven-central.storage-download.googleapis.com/maven2/")
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        maven("https://maven-central.storage-download.googleapis.com/maven2/")
        mavenCentral()
        // TDLib (официальная библиотека Telegram) в сборке для Android.
        maven("https://jitpack.io") { content { includeGroup("com.github.tdlibx") } }
    }
}
rootProject.name = "SoundAura"
include(":app")
