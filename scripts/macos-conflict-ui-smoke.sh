#!/usr/bin/env bash
set -euo pipefail

APP_PATH="${1:?app path required}"
STORE_DIR="$HOME/Library/Application Support/com.oshtz.keepdir"
STORE_FILE="$STORE_DIR/keepdir.json"
BAK_FILE="$STORE_DIR/keepdir.json.bak"
TMP_FILE="$STORE_DIR/keepdir.json.tmp"
STORE_BACKUP=""
BAK_BACKUP=""
DEMO_ROOT="${RUNNER_TEMP:-/tmp}/keepdir-conflict-ui"

quit_app() {
  osascript -e 'tell application "KeepDir" to quit' >/dev/null 2>&1 || true
}

restore_store() {
  quit_app
  if [ -n "$STORE_BACKUP" ]; then
    mv "$STORE_BACKUP" "$STORE_FILE"
  else
    rm -f "$STORE_FILE"
  fi
  if [ -n "$BAK_BACKUP" ]; then
    mv "$BAK_BACKUP" "$BAK_FILE"
  else
    rm -f "$BAK_FILE"
  fi
  rm -f "$TMP_FILE"
  rm -rf "$DEMO_ROOT"
}

trap restore_store EXIT

quit_app
mkdir -p "$STORE_DIR"
if [ -f "$STORE_FILE" ]; then
  STORE_BACKUP="$(mktemp "$STORE_DIR/keepdir.json.conflict-smoke.XXXXXX")"
  cp "$STORE_FILE" "$STORE_BACKUP"
fi
if [ -f "$BAK_FILE" ]; then
  BAK_BACKUP="$(mktemp "$STORE_DIR/keepdir.json.bak.conflict-smoke.XXXXXX")"
  cp "$BAK_FILE" "$BAK_BACKUP"
fi

rm -rf "$DEMO_ROOT"
mkdir -p "$DEMO_ROOT/Invoices"
printf 'new' > "$DEMO_ROOT/report-final.pdf"
printf 'existing' > "$DEMO_ROOT/Invoices/report-final.pdf"

python3 - "$DEMO_ROOT" "$STORE_FILE" "$(date -u +%F)" <<'PY'
import json
import os
import sys

root, store_file, today = sys.argv[1:]
source = os.path.join(root, "report-final.pdf")
target = os.path.join(root, "Invoices", "report-final.pdf")
stat = os.stat(source)
now = "1800000000000"

store = {
    "settings": {"lastUpdateCheckDate": today},
    "workspaceSettings": {"default": {"queueUnmatchedFiles": False, "automationRules": []}},
    "watchFolders": {
        "default": [{"id": "watch-conflict", "path": root, "enabled": True, "createdAt": now, "recursive": False}]
    },
    "ruleActions": {
        "default": [{
            "id": "action-conflict",
            "workspaceId": "default",
            "folderPath": root,
            "filePath": source,
            "originalName": "report-final.pdf",
            "targetPath": target,
            "targetName": "report-final.pdf",
            "ruleId": "rule-invoices",
            "ruleName": "Invoices",
            "ruleTrace": [{"ruleId": "rule-invoices", "ruleName": "Invoices", "matched": True, "uncertain": False, "reasons": ["extension matched"]}],
            "status": "conflict",
            "fileSize": stat.st_size,
            "fileMtimeMs": int(stat.st_mtime * 1000),
            "errorMessage": "Target already exists",
            "appliedSourcePath": None,
            "appliedTargetPath": None,
            "createdAt": now,
            "updatedAt": now
        }]
    }
}

with open(store_file, "w", encoding="utf-8") as f:
    json.dump(store, f, indent=2)
PY

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
  exit 1
fi
osascript -e 'tell application "System Events" to tell process "KeepDir" to set frontmost to true' >/dev/null 2>&1 || true

ax_do() {
  local identifier="$1"
  local action="$2"
  local value="${3:-}"
  AX_IDENTIFIER="$identifier" AX_ACTION="$action" AX_VALUE="$value" osascript <<'OSA'
on findByIdentifier(elementRef, wanted)
  tell application "System Events"
    try
      if ((value of attribute "AXIdentifier" of elementRef) as text) is wanted then return elementRef
    end try
    repeat with childRef in UI elements of elementRef
      set foundRef to my findByIdentifier(childRef, wanted)
      if foundRef is not missing value then return foundRef
    end repeat
  end tell
  return missing value
end findByIdentifier

set wanted to system attribute "AX_IDENTIFIER"
set wantedAction to system attribute "AX_ACTION"
set wantedValue to system attribute "AX_VALUE"
tell application "System Events"
  tell process "KeepDir"
    repeat with windowRef in windows
      set foundRef to my findByIdentifier(windowRef, wanted)
      if foundRef is not missing value then
        if wantedAction is "press" then
          perform action "AXPress" of foundRef
        else
          set value of foundRef to wantedValue
        end if
        return
      end if
    end repeat
  end tell
end tell
error "missing AXIdentifier " & wanted
OSA
}

ax_wait() {
  local identifier="$1"
  local action="$2"
  local value="${3:-}"
  for _ in {1..40}; do
    if ax_do "$identifier" "$action" "$value" 2>/dev/null; then
      return 0
    fi
    sleep 0.5
  done
  ax_do "$identifier" "$action" "$value"
}

ax_press() { ax_wait "$1" press; }
ax_set_value() { ax_wait "$1" set "$2"; }

wait_status() {
  local expected="$1"
  for _ in {1..40}; do
    if python3 - "$STORE_FILE" "$expected" <<'PY'
import json, sys
store_file, expected = sys.argv[1:]
with open(store_file, encoding="utf-8") as f:
    status = json.load(f)["ruleActions"]["default"][0]["status"]
raise SystemExit(0 if status == expected else 1)
PY
    then
      return 0
    fi
    sleep 0.5
  done
  echo "status did not become $expected; current state:" >&2
  python3 - "$STORE_FILE" <<'PY' >&2
import json, sys
with open(sys.argv[1], encoding="utf-8") as f:
    action = json.load(f)["ruleActions"]["default"][0]
print(action["status"], action.get("targetName"), action.get("errorMessage"))
PY
  return 1
}

ax_press "queue-row-action-conflict"
sleep 0.5
ax_set_value "queue-retarget-name" "report-final-2.pdf"
ax_press "queue-retarget-button"
wait_status pending
ax_press "queue-apply-selected-button"
wait_status applied
test ! -e "$DEMO_ROOT/report-final.pdf"
test "$(cat "$DEMO_ROOT/Invoices/report-final-2.pdf")" = "new"
test "$(cat "$DEMO_ROOT/Invoices/report-final.pdf")" = "existing"
ax_press "queue-undo-selected-button"
wait_status undone
test "$(cat "$DEMO_ROOT/report-final.pdf")" = "new"
test ! -e "$DEMO_ROOT/Invoices/report-final-2.pdf"
test "$(cat "$DEMO_ROOT/Invoices/report-final.pdf")" = "existing"

echo "OK macOS conflict UI rename/apply/undo cycle."
