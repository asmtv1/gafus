#!/bin/bash
# Установка NDK 26.2 для локальной сборки Android (совместимость с Prefab/hermestooling)

set -e
ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
NDK_VERSION="26.2.11394342"

# Поиск sdkmanager
SDKMANAGER=""
for path in \
  "/opt/homebrew/share/android-commandlinetools/cmdline-tools/latest/bin/sdkmanager" \
  "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" \
  "$ANDROID_HOME/tools/bin/sdkmanager"; do
  if [[ -x "$path" ]]; then
    SDKMANAGER="$path"
    break
  fi
done

if [[ -z "$SDKMANAGER" ]]; then
  echo "sdkmanager не найден. Установите Android command-line tools:"
  echo "  brew install --cask android-commandlinetools"
  echo "Или через Android Studio: SDK Manager → SDK Tools → Android SDK Command-line Tools"
  exit 1
fi

echo "Установка NDK $NDK_VERSION..."
yes | "$SDKMANAGER" --sdk_root="$ANDROID_HOME" --install "ndk;$NDK_VERSION"
echo "NDK $NDK_VERSION установлен в $ANDROID_HOME/ndk/$NDK_VERSION"
