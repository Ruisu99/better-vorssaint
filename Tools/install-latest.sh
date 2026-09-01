#!/bin/zsh
# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 Vorssaint

# Downloads the latest personal-fork build from GitHub and puts it in
# /Applications. No Xcode, no local compile. Run this on a Mac.
#
#   curl -fsSL https://raw.githubusercontent.com/Ruisu99/better-vorssaint/cursor/quick-ai-features-b4fa/Tools/install-latest.sh | zsh
#
# Or from a clone: ./Tools/install-latest.sh
set -euo pipefail

REPO="${VORSSAINT_FORK_REPO:-Ruisu99/better-vorssaint}"
TAG="${VORSSAINT_RELEASE_TAG:-personal-latest}"
APP_NAME="Vorssaint"
BUNDLE_ID="com.vorssaint.utils"
DEST="/Applications/${APP_NAME}.app"

if [[ "$(uname -s)" != "Darwin" ]]; then
    echo "This installer only runs on a Mac." >&2
    exit 1
fi
if [[ "$(uname -m)" != "arm64" ]]; then
    echo "This build is Apple Silicon only." >&2
    exit 1
fi

WORK="$(mktemp -d)"
cleanup() { rm -rf "$WORK"; }
trap cleanup EXIT

echo "▸ Asking GitHub for $REPO @ $TAG…"
API="https://api.github.com/repos/${REPO}/releases/tags/${TAG}"
if ! JSON="$(curl -fsSL -H 'Accept: application/vnd.github+json' \
    -H 'User-Agent: better-vorssaint-installer' "$API")"; then
    echo "Could not read https://github.com/${REPO}/releases/tag/${TAG}" >&2
    echo "Wait until the Personal build Action has finished, then try again." >&2
    exit 1
fi

ZIP_URL="$(printf '%s' "$JSON" | /usr/bin/python3 -c '
import json, sys
rel = json.load(sys.stdin)
for asset in rel.get("assets", []):
    if asset.get("name") == "Vorssaint.zip" and asset.get("browser_download_url"):
        print(asset["browser_download_url"])
        sys.exit(0)
sys.stderr.write("Release has no Vorssaint.zip yet.\n")
sys.exit(1)
')"

echo "▸ Downloading…"
curl -fL --progress-bar -o "$WORK/Vorssaint.zip" "$ZIP_URL"
/usr/bin/ditto -x -k "$WORK/Vorssaint.zip" "$WORK/unpack"
APP="$WORK/unpack/${APP_NAME}.app"
if [[ ! -d "$APP" ]]; then
    echo "The zip did not contain ${APP_NAME}.app" >&2
    exit 1
fi

echo "▸ Replacing ${DEST}…"
osascript -e "tell application \"${APP_NAME}\" to quit" >/dev/null 2>&1 || true
sleep 0.4
if /usr/bin/pgrep -x "$APP_NAME" >/dev/null 2>&1; then
    /usr/bin/killall "$APP_NAME" >/dev/null 2>&1 || true
    sleep 0.4
fi
/bin/rm -rf "$DEST"
/usr/bin/ditto "$APP" "$DEST"
/usr/bin/xattr -cr "$DEST"

# Official GitHub releases would overwrite this fork. Keep that check off.
/usr/bin/defaults write "$BUNDLE_ID" autoCheckUpdates -bool false

echo "▸ Opening…"
open "$DEST"
echo "✓ Installed. Look for the icon in the menu bar."
echo "  If macOS blocks it: right-click the app in Applications, choose Open."
echo "  Automatic official updates are off, so they cannot replace this build."
echo "  Next time you add features here, run this same command again."
