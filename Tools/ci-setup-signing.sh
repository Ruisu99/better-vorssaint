#!/bin/zsh
# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 Vorssaint

# Imports a stable code-signing identity so build.sh does not fall through to
# ad-hoc. macOS ties Accessibility and Screen Recording to that identity, so
# the same certificate across updates keeps those grants.
#
# Order:
#   1. SIGNING_CERT_P12 / SIGNING_CERT_PASSWORD (Developer ID or a durable cert)
#   2. Official releases (REQUIRE_SIGNING=1) stop here if those secrets are missing
#   3. Tools/personal-signing.b64, the Better Vorssaint self-signed identity
#   4. Otherwise ad-hoc, which will drop TCC grants on every install
set -euo pipefail
umask 077

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IDENTITY="Vorssaint Utils Signing"
KC="$HOME/Library/Keychains/vorssaint-signing.keychain-db"
KCPASS="vorssaint-signing"
P12=""
P12PASS=""
CLEANUP_P12=""

if [[ -n "${SIGNING_CERT_P12:-}" && -n "${SIGNING_CERT_PASSWORD:-}" ]]; then
    CLEANUP_P12="$(mktemp)"
    P12="$CLEANUP_P12"
    P12PASS="$SIGNING_CERT_PASSWORD"
    printf '%s' "$SIGNING_CERT_P12" | base64 --decode > "$P12"
    echo "Using signing certificate from GitHub secrets."
elif [[ "${REQUIRE_SIGNING:-0}" == "1" ]]; then
    echo "Release signing credentials are incomplete." >&2
    exit 1
elif [[ -f "$ROOT/Tools/personal-signing.b64" ]]; then
    CLEANUP_P12="$(mktemp)"
    P12="$CLEANUP_P12"
    P12PASS="better-vorssaint-signing"
    /usr/bin/python3 -c 'import base64,sys; sys.stdout.buffer.write(base64.b64decode(sys.stdin.read()))' \
        < "$ROOT/Tools/personal-signing.b64" > "$P12"
    echo "Using the Better Vorssaint personal signing identity."
else
    echo "No signing identity — building ad-hoc."
    exit 0
fi

cleanup() {
    [[ -n "$CLEANUP_P12" ]] && rm -f "$CLEANUP_P12"
}
trap cleanup EXIT

security delete-keychain "$KC" 2>/dev/null || true
security create-keychain -p "$KCPASS" "$KC"
security set-keychain-settings "$KC"
security unlock-keychain -p "$KCPASS" "$KC"
security import "$P12" -k "$KC" -P "$P12PASS" -T /usr/bin/codesign
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$KCPASS" "$KC" >/dev/null 2>&1
EXISTING=$(security list-keychains -d user | sed 's/"//g' | xargs)
security list-keychains -d user -s "$KC" ${=EXISTING}

probe="$(mktemp)"
cp /bin/echo "$probe"
if ! /usr/bin/codesign --force --strip-disallowed-xattrs --sign "$IDENTITY" "$probe" >/dev/null 2>&1 \
    && [[ -z "$(security find-identity -v -p codesigning 2>/dev/null | grep 'Developer ID Application' | head -1)" ]]; then
    rm -f "$probe"
    echo "Identity imported but codesign cannot use it." >&2
    exit 1
fi
rm -f "$probe"
echo "Signing certificate imported."
