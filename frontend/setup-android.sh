#!/bin/bash
set -euo pipefail

echo "=== Sinc: Android Native Project Setup ==="
echo ""

# 1. Build web assets
echo "[1/7] Building web assets..."
npm run build

# 2. Add Android platform (if not already added)
if [ ! -d "android" ]; then
  echo "[2/7] Adding Android platform..."
  npx cap add android
else
  echo "[2/7] Android platform already exists, skipping..."
fi

# 3. Copy web assets to native project
echo "[3/7] Syncing web assets..."
npx cap sync android

# 4. Generate and copy icon resources
echo "[4/7] Generating app icons from App icon.png..."
node generate-icons.mjs
echo "  Icons generated"

echo "[4/7] Copying icons to native project..."
ANDROID_RES="android/app/src/main/res"
ICON_SRC="public"

for dir in mipmap-mdpi mipmap-hdpi mipmap-xhdpi mipmap-xxhdpi mipmap-xxxhdpi; do
  cp "$ICON_SRC/$dir/ic_launcher.png" "$ANDROID_RES/$dir/"
  cp "$ICON_SRC/$dir/ic_launcher_round.png" "$ANDROID_RES/$dir/"
  echo "  Copied $dir icons"
done

mkdir -p "$ANDROID_RES/drawable"
cp "$ICON_SRC/drawable/ic_launcher_foreground.png" "$ANDROID_RES/drawable/"
echo "  Copied adaptive icon foreground"

mkdir -p "$ANDROID_RES/values"
cp "$ICON_SRC/values/ic_launcher_background.xml" "$ANDROID_RES/values/"
echo "  Copied icon background color"

mkdir -p "$ANDROID_RES/mipmap-anydpi-v26"
cp "$ICON_SRC/mipmap-anydpi-v26/ic_launcher.xml" "$ANDROID_RES/mipmap-anydpi-v26/"
cp "$ICON_SRC/mipmap-anydpi-v26/ic_launcher_round.xml" "$ANDROID_RES/mipmap-anydpi-v26/"
echo "  Copied adaptive icon XML descriptors"

# 5. Configure Android Manifest for Share Target
echo "[5/7] Configuring Android Manifest..."
MANIFEST="android/app/src/main/AndroidManifest.xml"

if grep -q "android.intent.action.SEND" "$MANIFEST" 2>/dev/null; then
  echo "  Share intent already configured, skipping..."
else
  sed -i 's|<intent-filter>|<intent-filter>\n                <action android:name="android.intent.action.SEND" />\n                <category android:name="android.intent.category.DEFAULT" />\n                <data android:mimeType="text/plain" />\n            </intent-filter>\n            <intent-filter>|' "$MANIFEST"
  echo "  Share intent filter added."
fi

# 6. Configure edge-to-edge in MainActivity
echo "[6/7] Configuring edge-to-edge..."
MAIN_ACTIVITY="android/app/src/main/java/com/spotdl/app/MainActivity.java"
if [ -f "$MAIN_ACTIVITY" ]; then
  if grep -q "EdgeToEdge" "$MAIN_ACTIVITY" 2>/dev/null; then
    echo "  Edge-to-edge already configured, skipping..."
  else
    sed -i 's|import android.os.Bundle;|import android.os.Bundle;\nimport androidx.activity.EdgeToEdge;|' "$MAIN_ACTIVITY"
    sed -i 's|super.onCreate(savedInstanceState);|EdgeToEdge.enable(this);\n        super.onCreate(savedInstanceState);|' "$MAIN_ACTIVITY"
    echo "  Edge-to-edge enabled in MainActivity."
  fi
fi

# 7. Add foreground service and notification permissions to manifest
echo "[7/7] Adding required permissions..."
if ! grep -q "POST_NOTIFICATIONS" "$MANIFEST" 2>/dev/null; then
  sed -i 's|<uses-permission android:name="android.permission.INTERNET"/>|<uses-permission android:name="android.permission.INTERNET"/>\n    <uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>\n    <uses-permission android:name="android.permission.WAKE_LOCK"/>\n    <uses-permission android:name="android.permission.FOREGROUND_SERVICE"/>\n    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK"/>|' "$MANIFEST"
  echo "  Permissions added."
fi

echo ""
echo "=== Setup complete! ==="
echo ""
echo "Next steps:"
echo "  1. Open android/ in Android Studio or run:"
echo "     cd android && ./gradlew assembleDebug"
echo "  2. Or install directly: npx cap run android"
echo ""
echo "The icon from your provided image has been applied!"
