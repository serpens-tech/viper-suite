#!/usr/bin/env bash
# Build a .deb installer for Crossed Viper on Debian/Ubuntu.
#
# Requirements:
#   sudo apt install dpkg-dev
#
# Run from anywhere:
#   bash crossed-viper/desktopclient/build_linux.sh

set -euo pipefail

# Always run from project root
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && cd ../.. && pwd)"
cd "$ROOT"

VERSION="1.0.0"
ARCH="amd64"
PKG="crossed-viper_${VERSION}_${ARCH}"
DIST="dist/deb/${PKG}"

echo "==> Cleaning previous build..."
rm -rf dist/deb
mkdir -p "${DIST}/DEBIAN"
mkdir -p "${DIST}/opt/crossed-viper"
  mkdir -p "${DIST}/usr/bin"
  mkdir -p "${DIST}/usr/share/applications"
  mkdir -p "${DIST}/usr/share/icons/hicolor/256x256/apps"

echo "==> Copying application files..."
mkdir -p "${DIST}/opt/crossed-viper/crossed-viper/webclient"
mkdir -p "${DIST}/opt/crossed-viper/crossed-viper/desktopclient"
cp -r app/                       "${DIST}/opt/crossed-viper/app"
cp -r crossed-viper/webclient/        "${DIST}/opt/crossed-viper/crossed-viper/webclient"
cp -r crossed-viper/desktopclient/    "${DIST}/opt/crossed-viper/crossed-viper/desktopclient"
cp    requirements.txt           "${DIST}/opt/crossed-viper/requirements.txt"
cp crossed-viper/webclient/icon-256.png "${DIST}/usr/share/icons/hicolor/256x256/apps/crossed-viper.png"

# ── DEBIAN/control ────────────────────────────────────────────────────────────
cat > "${DIST}/DEBIAN/control" <<EOF
Package: crossed-viper
Version: ${VERSION}
Section: utils
Priority: optional
Architecture: ${ARCH}
Maintainer: Viper Suite <vipersuite@example.com>
Depends: python3 (>= 3.10), python3-pip, python3-venv, python3-gi, python3-gi-cairo, gir1.2-webkit2-4.1
Description: Crossed Viper — Task Management Application
 A desktop task-management application with a FastAPI backend
 and a PyWebView-based frontend.
EOF

# ── DEBIAN/postinst ───────────────────────────────────────────────────────────
cat > "${DIST}/DEBIAN/postinst" <<'POSTINST'
#!/bin/bash
set -e
echo "Setting up Crossed Viper Python environment..."
cd /opt/crossed-viper
python3 -m venv --system-site-packages .venv 2>/dev/null || true
.venv/bin/pip install --upgrade pip -q
.venv/bin/pip install -r requirements.txt -q
.venv/bin/pip install "pywebview>=4.0.0" -q
echo "Crossed Viper is ready."
POSTINST
chmod 755 "${DIST}/DEBIAN/postinst"

# ── DEBIAN/prerm ──────────────────────────────────────────────────────────────
cat > "${DIST}/DEBIAN/prerm" <<'PRERM'
#!/bin/bash
rm -rf /opt/crossed-viper/.venv
PRERM
chmod 755 "${DIST}/DEBIAN/prerm"

# ── Launcher script ───────────────────────────────────────────────────────────
mkdir -p "${DIST}/opt/crossed-viper/bin"
cat > "${DIST}/opt/crossed-viper/bin/crossed-viper" <<'LAUNCHER'
#!/bin/bash
cd /opt/crossed-viper
exec .venv/bin/python crossed-viper/desktopclient/main.py "$@"
LAUNCHER
chmod +x "${DIST}/opt/crossed-viper/bin/crossed-viper"

ln -s /opt/crossed-viper/bin/crossed-viper "${DIST}/usr/bin/crossed-viper"

# ── .desktop entry ────────────────────────────────────────────────────────────
cat > "${DIST}/usr/share/applications/crossed-viper.desktop" <<EOF
[Desktop Entry]
Name=Crossed Viper
Icon=crossed-viper
GenericName=Task Manager
Comment=Manage your tasks and to-do lists
Exec=/opt/crossed-viper/bin/crossed-viper
Terminal=false
Type=Application
Categories=Utility;ProjectManagement;Office;
Keywords=task;todo;list;productivity;
EOF

# ── Build .deb ────────────────────────────────────────────────────────────────
echo "==> Building .deb package..."
dpkg-deb --build "${DIST}"

echo ""
echo "Done!  Package: dist/deb/${PKG}.deb"
echo ""
echo "Install with:"
echo "  sudo dpkg -i dist/deb/${PKG}.deb"
echo "  sudo apt-get install -f    # fix any missing system deps"
echo ""
echo "Then run:  crossed-viper"
