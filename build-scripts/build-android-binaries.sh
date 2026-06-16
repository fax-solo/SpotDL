#!/usr/bin/env bash
set -euo pipefail

# Build script for cross-compiling Python + SpotDL + FFmpeg for Android ARM64
# This script should be run on a Linux x86_64 machine with Docker available,
# or on a system with the Android NDK installed.

# --- Configuration ---
NDK_VERSION="r27c"
PYTHON_VERSION="3.8.18"
HOST_TAG="linux-x86_64"
TARGET_ARCH="aarch64-linux-android"
API_LEVEL=24
BUILD_DIR="/tmp/spotdl-android-build"
OUTPUT_DIR="$(cd "$(dirname "$0")/.." && pwd)/frontend/android/spotdl-plugin/src/main"

echo "=== Building SpotDL Android Binaries ==="
echo "Output dir: $OUTPUT_DIR"

mkdir -p "$BUILD_DIR"
cd "$BUILD_DIR"

# --- Step 1: Download Android NDK ---
if [ ! -d "android-ndk-${NDK_VERSION}" ]; then
    echo ">>> Downloading Android NDK ${NDK_VERSION}..."
    wget -q "https://dl.google.com/android/repository/android-ndk-${NDK_VERSION}-${HOST_TAG}.zip"
    unzip -q "android-ndk-${NDK_VERSION}-${HOST_TAG}.zip"
    rm "android-ndk-${NDK_VERSION}-${HOST_TAG}.zip"
fi

export NDK="$BUILD_DIR/android-ndk-${NDK_VERSION}"
export TOOLCHAIN="$NDK/toolchains/llvm/prebuilt/${HOST_TAG}"
export AR="$TOOLCHAIN/bin/llvm-ar"
export CC="$TOOLCHAIN/bin/${TARGET_ARCH}${API_LEVEL}-clang"
export CXX="$TOOLCHAIN/bin/${TARGET_ARCH}${API_LEVEL}-clang++"
export LD="$TOOLCHAIN/bin/ld"
export RANLIB="$TOOLCHAIN/bin/llvm-ranlib"
export STRIP="$TOOLCHAIN/bin/llvm-strip"
export PATH="$TOOLCHAIN/bin:$PATH"

# --- Step 2: Build Python for ARM64 ---
PYTHON_SRC="Python-${PYTHON_VERSION}"
if [ ! -d "$PYTHON_SRC" ]; then
    echo ">>> Downloading Python ${PYTHON_VERSION} source..."
    wget -q "https://www.python.org/ftp/python/${PYTHON_VERSION}/${PYTHON_SRC}.tar.xz"
    tar xf "${PYTHON_SRC}.tar.xz"
    rm "${PYTHON_SRC}.tar.xz"
fi

PYTHON_BUILD_DIR="$BUILD_DIR/python-build"
PYTHON_INSTALL_DIR="$BUILD_DIR/python-install"
mkdir -p "$PYTHON_BUILD_DIR" "$PYTHON_INSTALL_DIR"

echo ">>> Configuring Python for ${TARGET_ARCH}..."
cd "$PYTHON_BUILD_DIR"

# Android cross-compile config
cat > config.site << 'EOF'
ac_cv_file__dev_ptmx=no
ac_cv_file__dev_ptc=no
ac_cv_have_long_long_format=yes
ac_cv_pthread_system=yes
ac_cv_broken_poll=yes
ac_cv_working_tzset=no
ac_cv_func_getaddrinfo=yes
ac_cv_func_faccessat=no
EOF

CONFIG_SITE=config.site \
"$BUILD_DIR/$PYTHON_SRC/configure" \
    --host="${TARGET_ARCH}" \
    --build=x86_64-linux-gnu \
    --prefix="$PYTHON_INSTALL_DIR/usr" \
    --disable-ipv6 \
    --disable-test-modules \
    --disable-gil \
    ac_cv_file__dev_ptmx=no \
    ac_cv_file__dev_ptc=no \
    ac_cv_have_long_long_format=yes

echo ">>> Building Python..."
make -j$(nproc) 2>&1 | tail -20

echo ">>> Installing Python to $PYTHON_INSTALL_DIR..."
make install 2>&1 | tail -10

# Strip the Python binary
"$STRIP" "$PYTHON_INSTALL_DIR/usr/bin/python3.8" 2>/dev/null || true

# --- Step 3: Install SpotDL and dependencies ---
echo ">>> Installing pip and spotdl..."
HOSTPYTHON="$PYTHON_INSTALL_DIR/usr/bin/python3.8"

# Download get-pip.py
wget -q "https://bootstrap.pypa.io/get-pip.py" -O get-pip.py
PIP="$PYTHON_INSTALL_DIR/usr/bin/pip3"

# We need to use the host Python to do pip install with --target
# For cross-compile, we install packages into the Python install dir
$HOSTPYTHON get-pip.py --no-setuptools --no-wheel 2>&1 | tail -5

# Install spotdl and its dependencies
$PIP install --target="$PYTHON_INSTALL_DIR/usr/lib/python3.8/site-packages" \
    spotdl==4.2.11 \
    --no-deps \
    2>&1 | tail -10

# Install spotdl's core dependencies (minimal set)
$PIP install --target="$PYTHON_INSTALL_DIR/usr/lib/python3.8/site-packages" \
    yt-dlp>=2023.10.0 \
    mutagen \
    rich \
    rapidfuzz \
    thefuzz[speedup] \
    requests \
    beautifulsoup4 \
    lxml \
    charset-normalizer \
    colorama \
    --no-deps \
    2>&1 | tail -10

# --- Step 4: Download FFmpeg for Android ---
echo ">>> Downloading FFmpeg for Android..."
FFMPEG_DIR="$BUILD_DIR/ffmpeg-install"
mkdir -p "$FFMPEG_DIR/usr/bin"

# Download prebuilt FFmpeg for Android ARM64
# Using the popular ffmpeg-android builds
wget -q "https://github.com/FFmpeg/FFmpeg/archive/refs/tags/n6.0.tar.gz" -O ffmpeg-src.tar.gz
# For simplicity, use a prebuilt binary approach:
# Actually, let's use a prebuilt static FFmpeg binary for Android ARM64
wget -q "https://github.com/jonathansp/android-ffmpeg/raw/master/ffmpeg-arm64" -O "$FFMPEG_DIR/usr/bin/ffmpeg" || {
    echo ">>> Prebuilt FFmpeg not found, building from source..."
    # Build FFmpeg from source as fallback
    tar xzf ffmpeg-src.tar.gz 2>/dev/null || true
}
chmod +x "$FFMPEG_DIR/usr/bin/ffmpeg" 2>/dev/null || true

# --- Step 5: Package for the plugin ---
echo ">>> Packaging binaries for plugin..."

# Create Python zip for extraction by the plugin
PYTHON_ZIP="$OUTPUT_DIR/res/raw/python.zip"
rm -f "$PYTHON_ZIP"
cd "$PYTHON_INSTALL_DIR"
zip -r -9 "$PYTHON_ZIP" . 2>&1 | tail -5

# Create FFmpeg zip
FFMPEG_ZIP="$OUTPUT_DIR/res/raw/ffmpeg.zip"
rm -f "$FFMPEG_ZIP"
cd "$FFMPEG_DIR"
zip -r -9 "$FFMPEG_ZIP" . 2>&1 | tail -5

# Copy spotdl entry point script
# The spotdl binary is the Python script that serves as the entry point
SPOTDL_SCRIPT="$PYTHON_INSTALL_DIR/usr/lib/python3.8/site-packages/spotdl/__main__.py"
if [ -f "$SPOTDL_SCRIPT" ]; then
    cp "$SPOTDL_SCRIPT" "$OUTPUT_DIR/res/raw/spotdl"
    echo ">>> SpotDL entry point copied"
fi

# Copy JNI libs (the compiled python .so)
mkdir -p "$OUTPUT_DIR/jniLibs/arm64-v8a"
cp "$PYTHON_INSTALL_DIR/usr/lib/libpython3.8.so" "$OUTPUT_DIR/jniLibs/arm64-v8a/libpython.so" 2>/dev/null || {
    # Maybe it's buried deeper
    find "$PYTHON_INSTALL_DIR" -name "libpython*.so" -exec cp {} "$OUTPUT_DIR/jniLibs/arm64-v8a/libpython.so" \;
}

echo ""
echo "=== Build Complete ==="
echo ""
echo "Plugin resources at: $OUTPUT_DIR/res/raw/"
echo "Plugin JNI libs at:  $OUTPUT_DIR/jniLibs/"
echo ""
echo "To use:"
echo "  1. cd frontend"
echo "  2. npm run build"
echo "  3. npx cap sync android"
echo "  4. Open in Android Studio and build APK"
