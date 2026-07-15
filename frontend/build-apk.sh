#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

echo "=== Step 1: Build web frontend ==="
npm run build

echo ""
echo "=== Step 2: Sync to Android project ==="
npx cap sync android

echo ""
echo "=== Step 3: Generate icons ==="
node generate-icons.mjs 2>/dev/null || echo "  (icon generation skipped)"

echo ""
echo "=== Step 4: Build APK ==="
cd android
./gradlew assembleDebug

echo ""
echo "=== Done ==="
ls -lh app/build/outputs/apk/debug/app-debug.apk
