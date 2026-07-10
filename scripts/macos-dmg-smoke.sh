#!/usr/bin/env bash
set -euo pipefail

DMG_PATH="${1:?dmg path required}"
MOUNT_DIR="$(mktemp -d "${RUNNER_TEMP:-/tmp}/keepdir-dmg.XXXXXX")"

quit_app() {
  osascript -e 'tell application "KeepDir" to quit' >/dev/null 2>&1 || true
}

dump_diagnostics() {
  echo "KeepDir diagnostics:" >&2
  pgrep -ax KeepDir >&2 || true

  local report
  report="$(ls -t "$HOME"/Library/Logs/DiagnosticReports/KeepDir*.crash 2>/dev/null | head -n 1 || true)"
  if [ -n "$report" ]; then
    echo "Latest crash report: $report" >&2
    sed -n '1,180p' "$report" >&2 || true
  fi
}

cleanup() {
  quit_app
  hdiutil detach "$MOUNT_DIR" -quiet >/dev/null 2>&1 || true
  rmdir "$MOUNT_DIR" >/dev/null 2>&1 || true
}

trap cleanup EXIT

test -f "$DMG_PATH" || { echo "missing DMG: $DMG_PATH" >&2; exit 1; }

hdiutil attach "$DMG_PATH" -readonly -nobrowse -mountpoint "$MOUNT_DIR" -quiet

APP_PATH="$MOUNT_DIR/KeepDir.app"
INFO_PLIST="$APP_PATH/Contents/Info.plist"
EXECUTABLE="$APP_PATH/Contents/MacOS/KeepDir"
test -d "$APP_PATH" || { echo "missing KeepDir.app in DMG" >&2; exit 1; }
test -x "$EXECUTABLE" || { echo "missing executable: $EXECUTABLE" >&2; exit 1; }
for resource in PlusJakartaSans.ttf JetBrainsMono.ttf icon.png icon.svg; do
  test -f "$APP_PATH/Contents/Resources/$resource" || { echo "missing resource: $resource" >&2; exit 1; }
done
test -L "$MOUNT_DIR/Applications" || { echo "missing Applications shortcut in DMG" >&2; exit 1; }
test "$(readlink "$MOUNT_DIR/Applications")" = "/Applications" || { echo "Applications shortcut points to $(readlink "$MOUNT_DIR/Applications")" >&2; exit 1; }
test "$(/usr/libexec/PlistBuddy -c 'Print :LSMinimumSystemVersion' "$INFO_PLIST")" = "13.0"
test "$(/usr/libexec/PlistBuddy -c 'Print :LSUIElement' "$INFO_PLIST")" = "true"
lipo "$EXECUTABLE" -verify_arch arm64 x86_64 || {
  lipo -info "$EXECUTABLE" >&2
  echo "KeepDir executable must be universal arm64/x86_64" >&2
  exit 1
}

spctl --assess --type execute --verbose "$APP_PATH"

quit_app
open "$APP_PATH"
for _ in {1..40}; do
  if osascript -e 'tell application "System Events" to tell process "KeepDir" to count windows' 2>/dev/null | grep -q '^[1-9]'; then
    break
  fi
  sleep 0.5
done

windows="$(osascript -e 'tell application "System Events" to tell process "KeepDir" to count windows' 2>/dev/null || echo 0)"
if [ "$windows" -lt 1 ]; then
  echo "KeepDir did not expose a main window from mounted DMG" >&2
  dump_diagnostics
  exit 1
fi

background="$(osascript -e 'tell application "System Events" to tell process "KeepDir" to get background only' 2>/dev/null || echo false)"
if [ "$background" != "true" ]; then
  echo "KeepDir is not running as a menu-bar app from mounted DMG" >&2
  exit 1
fi

menu_items="$(osascript -e 'tell application "System Events" to tell process "KeepDir" to count menu bar items of menu bar 1' 2>/dev/null || echo 0)"
if [ "$menu_items" -lt 1 ]; then
  echo "KeepDir did not expose a menu-bar item from mounted DMG" >&2
  exit 1
fi

sleep 2
if ! pgrep -x KeepDir >/dev/null; then
  echo "KeepDir exited after opening from mounted DMG" >&2
  dump_diagnostics
  exit 1
fi

echo "OK KeepDir DMG mounts, has Applications shortcut, passes Gatekeeper assessment, and opens as a menu-bar app with $windows window(s) and $menu_items menu-bar item(s)."
