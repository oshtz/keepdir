#!/usr/bin/env bash
set -euo pipefail

APP_PATH="${1:?app path required}"
OUT_DIR="${2:?output dir required}"
BUNDLE_ID="com.oshtz.keepdir"
STORE_DIR="$HOME/Library/Application Support/com.oshtz.keepdir"
STORE_FILE="$STORE_DIR/keepdir.json"
BAK_FILE="$STORE_DIR/keepdir.json.bak"
TMP_FILE="$STORE_DIR/keepdir.json.tmp"
STORE_BACKUP=""
BAK_BACKUP=""

mkdir -p "$OUT_DIR"
mkdir -p "$STORE_DIR"

restore_store() {
  osascript -e 'tell application "KeepDir" to quit' >/dev/null 2>&1 || true
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
}

trap restore_store EXIT

if [ -f "$STORE_FILE" ]; then
  STORE_BACKUP="$STORE_FILE.keepdir-screenshot-backup"
  cp "$STORE_FILE" "$STORE_BACKUP"
fi
if [ -f "$BAK_FILE" ]; then
  BAK_BACKUP="$BAK_FILE.keepdir-screenshot-backup"
  cp "$BAK_FILE" "$BAK_BACKUP"
fi

seed_demo_store() {
  local state="${1:?state required}"
  local demo_root="${RUNNER_TEMP:-/tmp}/keepdir-demo"
  rm -rf "$demo_root"
  mkdir -p "$demo_root/Downloads/Invoices" "$demo_root/Inbox/Images" "$demo_root/Inbox/Invoices" "$demo_root/Inbox/Apps"
  printf 'invoice' > "$demo_root/Downloads/invoice-acme-0425.pdf"
  printf 'image' > "$demo_root/Inbox/Screenshot 2026-06-21.png"
  printf 'setup' > "$demo_root/Inbox/setup.exe"
  printf 'new-report' > "$demo_root/Inbox/report-final.pdf"
  printf 'existing-report' > "$demo_root/Inbox/Invoices/report-final.pdf"

  python3 - "$demo_root" "$STORE_FILE" "$state" <<'PY'
import json
import os
import sys

root, store_file, state = sys.argv[1:]
now = "1800000000000"

def snap(path):
    stat = os.stat(path)
    return stat.st_size, int(stat.st_mtime * 1000)

def action(action_id, folder, file_name, status, rule_id, rule_name, target=None, error=None):
    file_path = os.path.join(root, folder, file_name)
    size, mtime = snap(file_path)
    return {
        "id": action_id,
        "workspaceId": "default",
        "folderPath": os.path.join(root, folder),
        "filePath": file_path,
        "originalName": file_name,
        "targetPath": target,
        "targetName": os.path.basename(target) if target else None,
        "ruleId": rule_id,
        "ruleName": rule_name,
        "ruleTrace": [{
            "ruleId": rule_id,
            "ruleName": rule_name,
            "matched": True,
            "uncertain": False,
            "reasons": ["demo screenshot row"]
        }],
        "status": status,
        "fileSize": size,
        "fileMtimeMs": mtime,
        "errorMessage": error,
        "appliedSourcePath": file_path if status == "applied" else None,
        "appliedTargetPath": target if status == "applied" else None,
        "createdAt": now,
        "updatedAt": now
    }

downloads = os.path.join(root, "Downloads")
inbox = os.path.join(root, "Inbox")
rules = [
    {"id": "rule-invoices", "name": "Invoices to Finance", "enabled": True, "order": 0, "match": {"nameContains": "invoice", "extensionIn": ["pdf"]}, "action": {"targetFolder": "Invoices"}, "stopOnMatch": True},
    {"id": "rule-screenshots", "name": "Screenshots to Media", "enabled": True, "order": 1, "match": {"extensionIn": ["png", "jpg"]}, "action": {"targetFolder": "Images"}, "stopOnMatch": True},
    {"id": "rule-installers", "name": "Installers to Apps", "enabled": False, "order": 2, "match": {"extensionIn": ["exe", "dmg"]}, "action": {"targetFolder": "Apps", "ask": True}, "stopOnMatch": True}
]
watch_folders = [
    {"id": "watch-downloads", "path": downloads, "enabled": True, "createdAt": now, "recursive": False},
    {"id": "watch-inbox", "path": inbox, "enabled": True, "createdAt": now, "recursive": True}
]
actions = {
    "empty": [],
    "populated": [
        action("demo-ready-1", "Downloads", "invoice-acme-0425.pdf", "pending", "rule-invoices", "Invoices to Finance", os.path.join(downloads, "Invoices", "invoice-acme-0425.pdf")),
        action("demo-ready-2", "Inbox", "Screenshot 2026-06-21.png", "pending", "rule-screenshots", "Screenshots to Media", os.path.join(inbox, "Images", "Screenshot 2026-06-21.png")),
        action("demo-check-1", "Inbox", "setup.exe", "needs_review", "rule-installers", "Installers to Apps", None, "Rule asks for review")
    ],
    "conflict": [
        action("demo-conflict-1", "Inbox", "report-final.pdf", "conflict", "rule-invoices", "Invoices to Finance", os.path.join(inbox, "Invoices", "report-final.pdf"), "Target already exists")
    ],
    "history": [
        action("demo-applied-1", "Downloads", "invoice-acme-0425.pdf", "applied", "rule-invoices", "Invoices to Finance", os.path.join(downloads, "Invoices", "invoice-acme-0425.pdf")),
        action("demo-skipped-1", "Inbox", "Screenshot 2026-06-21.png", "skipped", "rule-screenshots", "Screenshots to Media", os.path.join(inbox, "Images", "Screenshot 2026-06-21.png"))
    ]
}
if state not in actions:
    raise SystemExit(f"unknown screenshot state: {state}")

store = {
    "settings": {"lastUpdateCheckDate": "2099-01-01"},
    "workspaceSettings": {
        "default": {
            "queueUnmatchedFiles": False,
            "automationRules": [] if state == "empty" else rules
        }
    },
    "watchFolders": {
        "default": [] if state == "empty" else watch_folders
    },
    "ruleActions": {
        "default": actions[state]
    }
}

with open(store_file, "w", encoding="utf-8") as f:
    json.dump(store, f, indent=2)
PY
}

ax_press() {
  local identifier="$1"
  AX_IDENTIFIER="$identifier" osascript <<'OSA'
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
tell application "System Events"
  tell process "KeepDir"
    repeat with windowRef in windows
      set foundRef to my findByIdentifier(windowRef, wanted)
      if foundRef is not missing value then
        perform action "AXPress" of foundRef
        return
      end if
    end repeat
  end tell
end tell
error "missing AXIdentifier " & wanted
OSA
}

ax_wait_press() {
  local identifier="$1"
  for _ in {1..20}; do
    if ax_press "$identifier" 2>/dev/null; then
      return 0
    fi
    sleep 0.25
  done
  ax_press "$identifier"
}

capture_theme() {
  local theme="$1"
  local state="$2"
  local file="$OUT_DIR/macos-$theme-$state.png"

  seed_demo_store "$state"
  defaults write "$BUNDLE_ID" theme "$theme"
  open "$APP_PATH"

  for _ in {1..40}; do
    if osascript -e 'tell application "System Events" to tell process "KeepDir" to count windows' 2>/dev/null | grep -q '^[1-9]'; then
      break
    fi
    sleep 0.5
  done

  local windows
  windows="$(osascript -e 'tell application "System Events" to tell process "KeepDir" to count windows' 2>/dev/null || echo 0)"
  if [ "$windows" -lt 1 ]; then
    echo "KeepDir did not expose a window for $theme capture" >&2
    exit 1
  fi

  osascript -e 'tell application "System Events" to tell process "KeepDir" to set frontmost to true' >/dev/null 2>&1 || true
  sleep 2
  if [ "$state" = "conflict" ]; then
    ax_wait_press "queue-row-demo-conflict-1"
    sleep 0.5
  elif [ "$state" = "history" ]; then
    ax_wait_press "queue-history-toggle"
    sleep 0.5
  fi
  window_rect="$(osascript <<'OSA'
tell application "System Events"
  tell process "KeepDir"
    set {windowX, windowY} to position of window 1
    set {windowWidth, windowHeight} to size of window 1
  end tell
end tell
return (windowX as text) & "," & (windowY as text) & "," & (windowWidth as text) & "," & (windowHeight as text)
OSA
)"
  if [[ ! "$window_rect" =~ ^-?[0-9]+,-?[0-9]+,[1-9][0-9]*,[1-9][0-9]*$ ]]; then
    echo "Could not determine KeepDir window bounds: $window_rect" >&2
    exit 1
  fi
  screencapture -x -o "-R$window_rect" "$file"
  osascript -e 'tell application "KeepDir" to quit' >/dev/null 2>&1 || true
  sleep 1

  if [ ! -s "$file" ]; then
    echo "missing screenshot: $file" >&2
    exit 1
  fi
}

for state in empty populated conflict history; do
  capture_theme light "$state"
  capture_theme dark "$state"
done
