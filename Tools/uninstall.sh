#!/bin/zsh
# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 Vorssaint

# Cleanly removes Better Vorssaint and every piece of system state it created:
# the fan helper daemon, the login item, TCC permissions, preferences, saved
# state, the app's own data folder and (if present) the password-free
# closed-lid sudoers rule. Also clears older Vorssaint.app / Developer copies
# left by previous fork installs.
set -uo pipefail

BUNDLE="com.ruisu99.bettervorssaint"
LEGACY_BUNDLES=("com.vorssaint.utils" "com.vorssaint.utils.dev" "com.ruisu99.bettervorssaint.dev")
APP="/Applications/Better Vorssaint.app"
APPS=(
    "/Applications/Better Vorssaint.app"
    "/Applications/Better Vorssaint (Developer).app"
    "/Applications/Vorssaint.app"
    "/Applications/Vorssaint (Developer).app"
    "/Applications/Vorssaint Utils.app"
)

echo "▸ Quitting…"
for proc in BetterVorssaint BetterVorssaintDeveloper Vorssaint VorssaintDeveloper VorssaintUtils; do
    pkill -x "$proc" 2>/dev/null || true
    pkill -f "/Contents/MacOS/$proc" 2>/dev/null || true
done
sleep 0.5

# Detach from the system from inside whichever bundle still exists.
detached=1
for candidate in \
    "/Applications/Better Vorssaint.app/Contents/MacOS/BetterVorssaint" \
    "/Applications/Better Vorssaint (Developer).app/Contents/MacOS/BetterVorssaintDeveloper" \
    "/Applications/Vorssaint.app/Contents/MacOS/Vorssaint" \
    "/Applications/Vorssaint (Developer).app/Contents/MacOS/VorssaintDeveloper"
do
    if [[ -x "$candidate" ]]; then
        echo "▸ Detaching the fan helper and login item, restoring sleep…"
        if "$candidate" --uninstall; then detached=0; fi
        break
    fi
done
if (( detached )); then
    launchctl print "system/$BUNDLE.fan-control" >/dev/null 2>&1
    (( $? == 113 )) && detached=0
fi

sleep_was_ours=0
[[ "$(defaults read "$BUNDLE" vorssDisabledSleep 2>/dev/null)" == "1" ]] && sleep_was_ours=1

echo "▸ Resetting permissions (Accessibility, Screen Recording)…"
tccutil reset All "$BUNDLE" >/dev/null 2>&1 || true
for legacy in "${LEGACY_BUNDLES[@]}"; do
    tccutil reset All "$legacy" >/dev/null 2>&1 || true
done

echo "▸ Removing app, preferences, saved state and stored data…"
rm -rf "${APPS[@]}"
for id in "$BUNDLE" "${LEGACY_BUNDLES[@]}"; do
    defaults delete "$id" >/dev/null 2>&1 || true
    rm -f "$HOME/Library/Preferences/$id.plist"
    rm -rf "$HOME/Library/Saved Application State/$id.savedState"
    rm -rf "$HOME/Library/Application Support/$id"
    rm -rf "$HOME/Library/Caches/$id"
    rm -rf "$HOME/Library/HTTPStorages/$id" "$HOME/Library/HTTPStorages/$id.binarycookies"
    rm -f "$HOME/Library/Preferences/ByHost/$id".*.plist(N)
done

RULES="/etc/sudoers.d/vorssaint-clamshell /etc/sudoers.d/vorssaint-utils-clamshell /etc/sudoers.d/vorss-clamshell"
if ls $RULES >/dev/null 2>&1; then
    echo "▸ Removing closed-lid sudoers rule (asks for your admin password)…"
    osascript -e "do shell script \"rm -f $RULES\" with administrator privileges with prompt \"Better Vorssaint uninstaller\"" || true
fi

if (( detached )); then
    echo ""
    echo "⚠ The fan helper may still be registered. If fans stay pinned, reboot once,"
    echo "  or run:   sudo launchctl bootout system/$BUNDLE.fan-control"
fi

if (( sleep_was_ours )); then
    if [[ "$(pmset -g | awk '/^\s*SleepDisabled/{print $2}')" == "1" ]]; then
        echo "▸ Restoring sleep…"
        pmset -a disablesleep 0 2>/dev/null || true
    fi
fi

echo "✓ Better Vorssaint removed."
