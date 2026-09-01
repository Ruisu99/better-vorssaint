#!/bin/zsh
# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 Vorssaint

# Downloads the latest Better Vorssaint personal build from GitHub and puts it
# in /Applications. No Xcode, no local compile. Run this on a Mac.
#
#   curl -fsSL https://raw.githubusercontent.com/Ruisu99/better-vorssaint/cursor/quick-ai-features-b4fa/Tools/install-latest.sh | zsh
#
# Or from a clone: ./Tools/install-latest.sh
set -euo pipefail

REPO="${VORSSAINT_FORK_REPO:-Ruisu99/better-vorssaint}"
TAG="${VORSSAINT_RELEASE_TAG:-personal-latest}"
APP_NAME="Better Vorssaint"
EXECUTABLE="BetterVorssaint"
BUNDLE_ID="com.ruisu99.bettervorssaint"
DEST="/Applications/${APP_NAME}.app"
ZIP_NAME="BetterVorssaint.zip"

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
wanted = ("BetterVorssaint.zip", "Vorssaint.zip")
for name in wanted:
    for asset in rel.get("assets", []):
        if asset.get("name") == name and asset.get("browser_download_url"):
            print(asset["browser_download_url"])
            sys.exit(0)
sys.stderr.write("Release has no BetterVorssaint.zip (or legacy Vorssaint.zip) yet.\n")
sys.exit(1)
')"

echo "▸ Downloading…"
curl -fL --progress-bar -o "$WORK/$ZIP_NAME" "$ZIP_URL"
/usr/bin/ditto -x -k "$WORK/$ZIP_NAME" "$WORK/unpack"

APP=""
for candidate in \
    "$WORK/unpack/${APP_NAME}.app" \
    "$WORK/unpack/Vorssaint.app"
do
    if [[ -d "$candidate" ]]; then
        APP="$candidate"
        break
    fi
done
if [[ -z "$APP" ]]; then
    echo "The zip did not contain ${APP_NAME}.app" >&2
    exit 1
fi

quit_app() {
    local name="$1"
    local proc="$2"
    osascript -e "tell application \"${name}\" to quit" >/dev/null 2>&1 || true
    sleep 0.3
    if /usr/bin/pgrep -x "$proc" >/dev/null 2>&1; then
        /usr/bin/killall "$proc" >/dev/null 2>&1 || true
        sleep 0.3
    fi
    # Long executable names are truncated in the process table.
    /usr/bin/pkill -f "/Contents/MacOS/${proc}" >/dev/null 2>&1 || true
}

echo "▸ Stopping older installs…"
quit_app "Better Vorssaint" "BetterVorssaint"
quit_app "Better Vorssaint (Developer)" "BetterVorssaintDeveloper"
quit_app "Vorssaint" "Vorssaint"
quit_app "Vorssaint (Developer)" "VorssaintDeveloper"

# One menu-bar icon only: remove every prior path this fork has used.
for legacy in \
    "/Applications/Better Vorssaint.app" \
    "/Applications/Better Vorssaint (Developer).app" \
    "/Applications/Vorssaint.app" \
    "/Applications/Vorssaint (Developer).app" \
    "/Applications/Vorssaint Utils.app"
do
    if [[ -d "$legacy" ]]; then
        echo "  removing $(basename "$legacy")"
        /bin/rm -rf "$legacy"
    fi
done

echo "▸ Installing ${DEST}…"
/usr/bin/ditto "$APP" "$DEST"
/usr/bin/xattr -cr "$DEST"

# Official GitHub releases would overwrite this fork. Keep that check off.
/usr/bin/defaults write "$BUNDLE_ID" autoCheckUpdates -bool false
# Also clear the flag on the old id in case prefs migration reads it later.
/usr/bin/defaults write "com.vorssaint.utils" autoCheckUpdates -bool false 2>/dev/null || true

# Refresh Launch Services so Spotlight and the Dock show Better Vorssaint, not
# a stale Vorssaint entry pointing at a deleted path.
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister \
    -f "$DEST" >/dev/null 2>&1 || true

echo "▸ Opening…"
open "$DEST"
echo "✓ Installed Better Vorssaint."
echo "  Look for the menu bar icon. Settings title says Better Vorssaint."
echo "  If macOS blocks it: right-click the app in Applications, choose Open."
echo "  Accessibility / Screen Recording may ask again (new bundle id)."
echo "  Automatic official updates are off."
echo "  Next update: wait for Personal build green, then run this command again."
