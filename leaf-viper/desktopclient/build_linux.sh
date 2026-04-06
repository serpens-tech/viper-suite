#!/usr/bin/env bash
# Build a .deb installer for Leaf Viper on Debian/Ubuntu.
#
# Requirements:
#   sudo apt install dpkg-dev
#
# Run from anywhere:
#   bash leaf-viper/desktopclient/build_linux.sh

set -euo pipefail

# Always run from project root
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && cd ../.. && pwd)"
cd "$ROOT"

VERSION="1.0.0"
ARCH="amd64"
PKG="leaf-viper_${VERSION}_${ARCH}"
DIST="dist/deb/${PKG}"

echo "==> Cleaning previous build..."
rm -rf dist/deb
mkdir -p "${DIST}/DEBIAN"
mkdir -p "${DIST}/opt/leaf-viper"
mkdir -p "${DIST}/usr/bin"
mkdir -p "${DIST}/usr/share/applications"
mkdir -p "${DIST}/usr/share/icons/hicolor/256x256/apps"

echo "==> Copying application files..."
mkdir -p "${DIST}/opt/leaf-viper/leaf-viper"
cp -r app/                        "${DIST}/opt/leaf-viper/app"
cp -r leaf-viper/webclient        "${DIST}/opt/leaf-viper/leaf-viper/webclient"
cp -r leaf-viper/desktopclient    "${DIST}/opt/leaf-viper/leaf-viper/desktopclient"
cp requirements.txt            "${DIST}/opt/leaf-viper/requirements.txt"
cp leaf-viper/webclient/icon-256.png "${DIST}/usr/share/icons/hicolor/256x256/apps/leaf-viper.png"

# DEBIAN/control
cat > "${DIST}/DEBIAN/control" <<EOF
Package: leaf-viper
Version: ${VERSION}
Section: utils
Priority: optional
Architecture: ${ARCH}
Maintainer: Viper Suite <vipersuite@example.com>
Depends: python3 (>= 3.10), python3-pip, python3-venv, python3-gi, python3-gi-cairo, gir1.2-webkit2-4.1
Description: Leaf Viper - Task Management Application
 A desktop task-management application with a FastAPI backend
 and a PyWebView-based frontend.
EOF

# DEBIAN/postinst
cat > "${DIST}/DEBIAN/postinst" <<'POSTINST'
#!/bin/bash
set -e
echo "Setting up Leaf Viper Python environment..."
cd /opt/leaf-viper
python3 -m venv --system-site-packages .venv 2>/dev/null || true
.venv/bin/pip install --upgrade pip -q
.venv/bin/pip install -r requirements.txt -q
.venv/bin/pip install "pywebview>=4.0.0" -q
echo "Leaf Viper is ready."
POSTINST
chmod 755 "${DIST}/DEBIAN/postinst"

# DEBIAN/prerm
cat > "${DIST}/DEBIAN/prerm" <<'PRERM'
#!/bin/bash
rm -rf /opt/leaf-viper/.venv
PRERM
chmod 755 "${DIST}/DEBIAN/prerm"

# Launcher script
mkdir -p "${DIST}/opt/leaf-viper/bin"
cat > "${DIST}/opt/leaf-viper/bin/leaf-viper" <<'LAUNCHER'
#!/bin/bash
cd /opt/leaf-viper
exec .venv/bin/python leaf-viper/desktopclient/main.py "$@"
LAUNCHER
chmod +x "${DIST}/opt/leaf-viper/bin/leaf-viper"

ln -s /opt/leaf-viper/bin/leaf-viper "${DIST}/usr/bin/leaf-viper"

# .desktop entry
cat > "${DIST}/usr/share/applications/leaf-viper.desktop" <<EOF
[Desktop Entry]
Name=Leaf Viper
Icon=leaf-viper
GenericName=Task Manager
Comment=Manage your tasks and budgets
Exec=/opt/leaf-viper/bin/leaf-viper
Terminal=false
Type=Application
Categories=Utility;ProjectManagement;Office;
Keywords=task;todo;list;budget;productivity;
EOF

# Build .deb
echo "==> Building .deb package..."
dpkg-deb --build "${DIST}"

echo ""
echo "Done!  Package: dist/deb/${PKG}.deb"
echo ""
echo "Install with:"
echo "  sudo dpkg -i dist/deb/${PKG}.deb"
echo "  sudo apt-get install -f    # fix any missing system deps"
echo ""
echo "Then run:  leaf-viper"
