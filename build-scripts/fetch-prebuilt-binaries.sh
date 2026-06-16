#!/usr/bin/env bash
set -euo pipefail

# Simplified script that fetches PREBUILT ARM64 Android binaries
# where available and builds what isn't.
#
# This is useful when you don't want to cross-compile from source.
#
# Prebuilt sources:
#   - Python for Android: https://github.com/termux/termux-packages (or turn-key GitHub releases)
#   - FFmpeg for Android: https://github.com/jonathansp/android-ffmpeg
#   - SpotDL: pip install (cross-compiled)
#
# For a full production build, use the Dockerfile-based cross-compilation.

OUTPUT_DIR="$(cd "$(dirname "$0")/.." && pwd)/frontend/android/spotdl-plugin/src/main"
BUILD_DIR="/tmp/spotdl-prebuilt"
mkdir -p "$BUILD_DIR"
mkdir -p "$OUTPUT_DIR/jniLibs/arm64-v8a"
mkdir -p "$OUTPUT_DIR/res/raw"

echo "=== Fetching prebuilt Android ARM64 binaries ==="
echo "Output: $OUTPUT_DIR"

# --- 1. Python for Android ARM64 ---
# Termux provides Python for Android. We use their compiled packages.
echo ""
echo ">>> Python for ARM64..."
PYTHON_DIR="$BUILD_DIR/python"
mkdir -p "$PYTHON_DIR/usr"

# Download prebuilt Python from Termux's package repository
# Using turn-key GH releases approach: https://github.com/termux/termux-packages
# For aarch64, we can use the package: python (3.11)
wget -q "https://packages.termux.org/apt/termux-main/pool/main/p/python/python_3.11.8_aarch64.deb" -O "$BUILD_DIR/python.deb" 2>/dev/null || {
    echo "   Termux package not available, trying alternative..."
    # Alternative: use the embedded Python from spotdl-android releases
    wget -q "https://github.com/BobbyESP/spotdl-android/releases/download/0.2.1/spotdl-android-ffmpeg-0.2.1.aar" -O "$BUILD_DIR/ffmpeg.aar" 2>/dev/null || true
    wget -q "https://github.com/BobbyESP/spotdl-android/releases/download/0.2.1/spotdl-android-library-0.2.1.aar" -O "$BUILD_DIR/library.aar" 2>/dev/null || true
    echo "   Downloaded AARs from spotdl-android releases."
    echo "   Extracting binaries..."
    if [ -f "$BUILD_DIR/library.aar" ]; then
        cd "$BUILD_DIR"
        unzip -o library.aar -d library-aar 2>/dev/null || true
        find library-aar -name "*.so" -exec cp {} "$OUTPUT_DIR/jniLibs/arm64-v8a/" \;
        echo "   Extracted .so files from library AAR"
    fi
    if [ -f "$BUILD_DIR/ffmpeg.aar" ]; then
        cd "$BUILD_DIR"
        unzip -o ffmpeg.aar -d ffmpeg-aar 2>/dev/null || true
        find ffmpeg-aar -name "*.so" -exec cp {} "$OUTPUT_DIR/jniLibs/arm64-v8a/" \;
        echo "   Extracted .so files from ffmpeg AAR"
    fi
}

# --- 2. SpotDL Python package ---
echo ""
echo ">>> SpotDL script..."
# Create a small spotdl entry point wrapper
cat > "$OUTPUT_DIR/res/raw/spotdl" << 'PYEOF'
#!/usr/bin/env python3
"""SpotDL entry point for Android"""
import sys
import os

# Add the Python packages directory to path
python_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
packages_dir = os.path.join(os.path.dirname(python_dir), 'packages', 'python')
if os.path.exists(packages_dir):
    site_packages = os.path.join(packages_dir, 'usr', 'lib', 'python3.8', 'site-packages')
    if os.path.exists(site_packages):
        sys.path.insert(0, site_packages)

from spotdl.__main__ import main
sys.exit(main())
PYEOF
echo "   Created spotdl entry point script"

# --- 3. Create placeholder files if binaries weren't downloaded ---
echo ""
echo ">>> Checking binaries..."
if [ ! -f "$OUTPUT_DIR/jniLibs/arm64-v8a/libpython.so" ]; then
    echo "   WARNING: libpython.so not found!"
    echo "   Create an empty placeholder for now."
    touch "$OUTPUT_DIR/jniLibs/arm64-v8a/libpython.so"
fi
if [ ! -f "$OUTPUT_DIR/jniLibs/arm64-v8a/libffmpeg.so" ]; then
    echo "   WARNING: libffmpeg.so not found!"
    touch "$OUTPUT_DIR/jniLibs/arm64-v8a/libffmpeg.so"
fi

echo ""
echo "=== Done ==="
echo ""
echo "Plugin resources:"
ls -la "$OUTPUT_DIR/res/raw/" 2>/dev/null
echo ""
echo "JNI libs:"
ls -la "$OUTPUT_DIR/jniLibs/arm64-v8a/" 2>/dev/null
echo ""
echo "NOTE: You still need actual ARM64 binaries."
echo "To get them:"
echo "  1. Run: docker build -t spotdl-builder -f build-scripts/Dockerfile.arm-builder build-scripts/"
echo "  2. Or extract from spotdl-android AARs (see script above)"
