#!/usr/bin/env bash
set -euo pipefail

APP_PATH="${1:?app path required}"
INFO_PLIST="$APP_PATH/Contents/Info.plist"
EXECUTABLE="$APP_PATH/Contents/MacOS/KeepDir"
BUNDLE_ID="com.oshtz.keepdir"

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

trap quit_app EXIT

test -x "$EXECUTABLE" || { echo "missing executable: $EXECUTABLE" >&2; exit 1; }
for resource in PlusJakartaSans.ttf JetBrainsMono.ttf icon.png icon.svg; do
  test -f "$APP_PATH/Contents/Resources/$resource" || { echo "missing resource: $resource" >&2; exit 1; }
done
test "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$INFO_PLIST")" = "$BUNDLE_ID"
test "$(/usr/libexec/PlistBuddy -c 'Print :LSMinimumSystemVersion' "$INFO_PLIST")" = "13.0"
test "$(/usr/libexec/PlistBuddy -c 'Print :LSUIElement' "$INFO_PLIST")" = "true"
lipo "$EXECUTABLE" -verify_arch arm64 x86_64 || {
  lipo -info "$EXECUTABLE" >&2
  echo "KeepDir executable must be universal arm64/x86_64" >&2
  exit 1
}

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
  echo "KeepDir did not expose a main window" >&2
  dump_diagnostics
  exit 1
fi

sleep 2
if ! pgrep -x KeepDir >/dev/null; then
  echo "KeepDir exited after opening its main window" >&2
  dump_diagnostics
  exit 1
fi

background="$(osascript -e 'tell application "System Events" to tell process "KeepDir" to get background only' 2>/dev/null || echo false)"
if [ "$background" != "true" ]; then
  echo "KeepDir is not running as a menu-bar app" >&2
  exit 1
fi

menu_items="$(osascript -e 'tell application "System Events" to tell process "KeepDir" to count menu bar items of menu bar 1' 2>/dev/null || echo 0)"
if [ "$menu_items" -lt 1 ]; then
  echo "KeepDir did not expose a menu-bar item" >&2
  exit 1
fi

open "$APP_PATH"
sleep 1
processes="$(pgrep -x KeepDir | wc -l | tr -d ' ')"
if [ "$processes" -ne 1 ]; then
  echo "KeepDir spawned $processes processes after second open" >&2
  dump_diagnostics
  exit 1
fi

assert_ax_identifier() {
  local identifier="$1"
  AX_IDENTIFIER="$identifier" osascript <<'OSA'
on hasIdentifier(elementRef, wanted)
  tell application "System Events"
    try
      if ((value of attribute "AXIdentifier" of elementRef) as text) is wanted then return true
    end try
    try
      repeat with childRef in UI elements of elementRef
        if my hasIdentifier(childRef, wanted) then return true
      end repeat
    end try
  end tell
  return false
end hasIdentifier

set wanted to system attribute "AX_IDENTIFIER"
if wanted is "" then error "missing AX_IDENTIFIER"
tell application "System Events"
  tell process "KeepDir"
    repeat with windowRef in windows
      if my hasIdentifier(windowRef, wanted) then return
    end repeat
  end tell
end tell
error "missing AXIdentifier " & wanted
OSA
}

for identifier in \
  watch-folders-heading \
  queue-heading \
  rules-heading \
  queue-retarget-name \
  queue-retarget-button \
  queue-apply-selected-button \
  queue-undo-selected-button
do
  assert_ax_identifier "$identifier"
done

echo "OK KeepDir macOS app launched as a menu-bar single-instance app with $windows window(s) and $menu_items menu-bar item(s)."
