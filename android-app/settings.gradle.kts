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
        // …и NewPipeExtractor: поиск песен YouTube Music прямо на телефоне, без Python.
        maven("https://jitpack.io") { content { includeGroup("com.github.tdlibx"); includeGroupByRegex("com\\.github\\.TeamNewPipe.*") } }
    }
}
rootProject.name = "SoundAura"
include(":app")
