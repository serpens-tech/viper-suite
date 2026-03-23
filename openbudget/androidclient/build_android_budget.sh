#!/usr/bin/env bash
# Build OpenBudget Android APK using Capacitor.
#
# Requirements:
#   - Node.js 18+  (https://nodejs.org)
#   - Android Studio with Android SDK (API 22+)
#   - Java 17+
#   - ANDROID_HOME environment variable set:
#       export ANDROID_HOME=~/Android/Sdk
#       export PATH=$PATH:$ANDROID_HOME/tools:$ANDROID_HOME/platform-tools
#
# Run from the project root:
#   bash openbudget/androidclient/build_android_budget.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && cd ../.. && pwd)"
cd "$ROOT/openbudget/androidclient"

echo "==> Installing Node dependencies..."
npm install

echo "==> Adding Android platform (first run only)..."
if [ ! -d "android" ]; then
    npx cap add android
else
    echo "    Android platform already present, skipping."
fi

echo "==> Syncing web assets into Android project..."
npx cap sync android

echo "==> Building debug APK..."
cd android
./gradlew assembleDebug

APK="app/build/outputs/apk/debug/app-debug.apk"
echo ""
echo "Done!"
echo "APK: openbudget/androidclient/android/${APK}"
echo ""
echo "Install on a connected device:"
echo "  adb install openbudget/androidclient/android/${APK}"
echo ""
echo "Or open the project in Android Studio:"
echo "  cd openbudget/androidclient && npx cap open android"
