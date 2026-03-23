#!/usr/bin/env bash
# Build a .deb installer for OpenTask on Debian/Ubuntu.
#
# Requirements:
#   sudo apt install dpkg-dev
#
# Run from the project root:
#   bash build/build_linux.sh

set -euo pipefail

VERSION="1.0.0"
ARCH="amd64"
PKG="opentask_${VERSION}_${ARCH}"
DIST="dist/deb/${PKG}"

echo "==> Cleaning previous build..."
rm -rf dist/deb
mkdir -p "${DIST}/DEBIAN"
mkdir -p "${DIST}/opt/opentask"
mkdir -p "${DIST}/usr/bin"
mkdir -p "${DIST}/usr/share/applications"
mkdir -p "${DIST}/usr/share/icons/hicolor/256x256/apps"

echo "==> Copying application files..."
cp -r app/         "${DIST}/opt/opentask/app"
cp -r webclient/   "${DIST}/opt/opentask/webclient"
cp -r desktopclient/ "${DIST}/opt/opentask/desktopclient"
cp    requirements.txt "${DIST}/opt/opentask/requirements.txt"
cp webclient/icon-256.png "${DIST}/usr/share/icons/hicolor/256x256/apps/opentask.png"

# ── DEBIAN/control ────────────────────────────────────────────────────────────
cat > "${DIST}/DEBIAN/control" <<EOF
Package: opentask
Version: ${VERSION}
Section: utils
Priority: optional
Architecture: ${ARCH}
Maintainer: OpenTask <opentask@example.com>
Depends: python3 (>= 3.10), python3-pip, python3-venv, python3-gi, python3-gi-cairo, gir1.2-webkit2-4.1
Description: OpenTask — Task Management Application
 A desktop task-management application with a FastAPI backend
 and a PyWebView-based frontend.
EOF

# ── DEBIAN/postinst ───────────────────────────────────────────────────────────
cat > "${DIST}/DEBIAN/postinst" <<'POSTINST'
#!/bin/bash
set -e
echo "Setting up OpenTask Python environment..."
cd /opt/opentask
python3 -m venv --system-site-packages .venv 2>/dev/null || true
.venv/bin/pip install --upgrade pip -q
.venv/bin/pip install -r requirements.txt -q
.venv/bin/pip install "pywebview>=4.0.0" -q
echo "OpenTask is ready."
POSTINST
chmod 755 "${DIST}/DEBIAN/postinst"

# ── DEBIAN/prerm ──────────────────────────────────────────────────────────────
cat > "${DIST}/DEBIAN/prerm" <<'PRERM'
#!/bin/bash
rm -rf /opt/opentask/.venv
PRERM
chmod 755 "${DIST}/DEBIAN/prerm"

# ── Launcher script ───────────────────────────────────────────────────────────
cat > "${DIST}/opt/opentask/opentask" <<'LAUNCHER'
#!/bin/bash
cd /opt/opentask
exec .venv/bin/python desktopclient/main.py "$@"
LAUNCHER
chmod +x "${DIST}/opt/opentask/opentask"

ln -s /opt/opentask/opentask "${DIST}/usr/bin/opentask"

# ── .desktop entry ────────────────────────────────────────────────────────────
cat > "${DIST}/usr/share/applications/opentask.desktop" <<EOF
[Desktop Entry]
Name=OpenTask
Icon=opentask
GenericName=Task Manager
Comment=Manage your tasks and to-do lists
Exec=/opt/opentask/opentask
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
echo "Then run:  opentask"
