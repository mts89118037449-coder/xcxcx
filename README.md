# SoundAura — Android music app

Исходный код Android-приложения находится в каталоге [`android-app/`](android-app/).

## Сборка APK

Сборка настроена в [GitHub Actions](.github/workflows/android.yml). Для локальной сборки используйте Gradle Wrapper из `android-app/`:

```bash
cd android-app
./gradlew assembleRelease
```

## Ветка исправлений

В этой ветке исправляется переключение музыкального трека в видеоплеер и добавляется автоматическая повторная попытка при ошибке воспроизведения. Изменения не затрагивают рабочие ветки других разработчиков.
