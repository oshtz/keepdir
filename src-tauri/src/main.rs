use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::{HashMap, HashSet},
    fs,
    path::{Component, Path, PathBuf},
    sync::{Mutex, MutexGuard, OnceLock},
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, WindowEvent,
};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};

const AUTOMATION_RULES_KEY: &str = "automationRules";
const KEYCHAIN_SERVICE: &str = "KeepDir Rule Assistant";
const LATEST_RELEASE_URL: &str = "https://github.com/oshtz/keepdir/releases/latest";
const TRAY_ID: &str = "main";
const WATCH_INTERVAL: Duration = Duration::from_secs(2);

static STORE_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct WatchFolder {
    id: String,
    path: String,
    enabled: bool,
    created_at: Option<String>,
    #[serde(default)]
    recursive: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
struct FileSnapshot {
    size: u64,
    mtime_ms: u128,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
struct RuleMatch {
    name_contains: Option<String>,
    extension_in: Vec<String>,
    source_url_contains: Option<String>,
    downloaded_from_contains: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
struct RuleActionConfig {
    target_folder: Option<String>,
    target_name_template: Option<String>,
    ask: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
struct FileRule {
    id: String,
    name: String,
    enabled: bool,
    order: i64,
    #[serde(rename = "match")]
    rule_match: RuleMatch,
    action: RuleActionConfig,
    stop_on_match: Option<bool>,
}

impl Default for FileRule {
    fn default() -> Self {
        Self {
            id: String::new(),
            name: String::new(),
            enabled: false,
            order: 0,
            rule_match: RuleMatch::default(),
            action: RuleActionConfig::default(),
            stop_on_match: Some(true),
        }
    }
}

#[derive(Debug, Clone, Default)]
struct DownloadMetadata {
    source_url: Option<String>,
    downloaded_from: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RuleTraceItem {
    rule_id: String,
    rule_name: String,
    matched: bool,
    uncertain: bool,
    reasons: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RuleAction {
    id: String,
    workspace_id: String,
    folder_path: String,
    file_path: String,
    original_name: String,
    target_path: Option<String>,
    target_name: Option<String>,
    rule_id: Option<String>,
    rule_name: Option<String>,
    rule_trace: Vec<RuleTraceItem>,
    status: String,
    file_size: u64,
    file_mtime_ms: u128,
    error_message: Option<String>,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
struct Store {
    settings: Value,
    workspace_settings: HashMap<String, HashMap<String, Value>>,
    watch_folders: HashMap<String, Vec<WatchFolder>>,
    rule_actions: HashMap<String, Vec<RuleAction>>,
}

fn store_guard() -> Result<MutexGuard<'static, ()>, String> {
    STORE_LOCK
        .get_or_init(|| Mutex::new(()))
        .lock()
        .map_err(|error| error.to_string())
}

fn store_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    Ok(dir.join("keepdir.json"))
}

fn load_store(app: &AppHandle) -> Result<Store, String> {
    let path = store_path(app)?;
    if !path.exists() {
        return Ok(Store::default());
    }
    let text = fs::read_to_string(path).map_err(|error| error.to_string())?;
    serde_json::from_str(&text).map_err(|error| error.to_string())
}

fn save_store(app: &AppHandle, store: &Store) -> Result<(), String> {
    let path = store_path(app)?;
    let text = serde_json::to_string_pretty(store).map_err(|error| error.to_string())?;
    fs::write(path, text).map_err(|error| error.to_string())
}

fn now_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}

fn now_string() -> String {
    now_ms().to_string()
}

fn today_utc() -> String {
    let days = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
        / 86_400;
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = mp + if mp < 10 { 3 } else { -9 };
    let year = y + if month <= 2 { 1 } else { 0 };
    format!("{year:04}-{month:02}-{day:02}")
}

fn snapshot(metadata: &fs::Metadata) -> FileSnapshot {
    FileSnapshot {
        size: metadata.len(),
        mtime_ms: metadata
            .modified()
            .ok()
            .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
            .map(|duration| duration.as_millis())
            .unwrap_or(0),
    }
}

fn normalized_rules(value: Option<&Value>) -> Vec<FileRule> {
    let mut rules = value
        .and_then(|item| serde_json::from_value::<Vec<FileRule>>(item.clone()).ok())
        .unwrap_or_default();
    rules.sort_by_key(|rule| rule.order);
    rules
}

fn includes_case_insensitive(value: &str, needle: &str) -> bool {
    value.to_lowercase().contains(&needle.to_lowercase())
}

fn file_extension(name: &str) -> String {
    Path::new(name)
        .extension()
        .and_then(|item| item.to_str())
        .unwrap_or("")
        .to_lowercase()
}

fn file_stem(name: &str) -> String {
    Path::new(name)
        .file_stem()
        .and_then(|item| item.to_str())
        .unwrap_or(name)
        .to_string()
}

fn rule_match(
    rule: &FileRule,
    original_name: &str,
    extension: &str,
    metadata: &DownloadMetadata,
) -> (bool, bool, Vec<String>) {
    let mut reasons = Vec::new();

    if let Some(needle) = rule
        .rule_match
        .name_contains
        .as_deref()
        .filter(|item| !item.is_empty())
    {
        if !includes_case_insensitive(original_name, needle) {
            return (
                false,
                false,
                vec![format!("name does not contain \"{needle}\"")],
            );
        }
        reasons.push(format!("name contains \"{needle}\""));
    }

    if !rule.rule_match.extension_in.is_empty() {
        let allowed: Vec<String> = rule
            .rule_match
            .extension_in
            .iter()
            .map(|item| item.trim_start_matches('.').to_lowercase())
            .collect();
        if !allowed.iter().any(|item| item == extension) {
            return (
                false,
                false,
                vec![format!("extension is not {}", allowed.join(", "))],
            );
        }
        reasons.push(format!(
            "extension is {}",
            if extension.is_empty() {
                "(none)"
            } else {
                extension
            }
        ));
    }

    if let Some(needle) = rule
        .rule_match
        .source_url_contains
        .as_deref()
        .filter(|item| !item.is_empty())
    {
        match metadata.source_url.as_deref() {
            Some(source) if includes_case_insensitive(source, needle) => {
                reasons.push(format!("source URL contains \"{needle}\""));
            }
            Some(_) => {
                return (
                    false,
                    false,
                    vec![format!("source URL does not contain \"{needle}\"")],
                )
            }
            None => {
                return (
                    true,
                    true,
                    vec!["source URL metadata unavailable".to_string()],
                )
            }
        }
    }

    if let Some(needle) = rule
        .rule_match
        .downloaded_from_contains
        .as_deref()
        .filter(|item| !item.is_empty())
    {
        match metadata.downloaded_from.as_deref() {
            Some(source) if includes_case_insensitive(source, needle) => {
                reasons.push(format!("downloaded-from contains \"{needle}\""));
            }
            Some(_) => {
                return (
                    false,
                    false,
                    vec![format!("downloaded-from does not contain \"{needle}\"")],
                )
            }
            None => {
                return (
                    true,
                    true,
                    vec!["downloaded-from metadata unavailable".to_string()],
                )
            }
        }
    }

    if reasons.is_empty() {
        reasons.push("matched all files".to_string());
    }
    (true, false, reasons)
}

fn safe_filename(raw: &str) -> Result<String, String> {
    let name = raw
        .chars()
        .map(|character| {
            if character.is_control()
                || matches!(
                    character,
                    '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*'
                )
            {
                '_'
            } else {
                character
            }
        })
        .collect::<String>()
        .trim()
        .trim_matches('.')
        .to_string();
    if name.is_empty() {
        Err("Target filename is empty after sanitizing".to_string())
    } else {
        Ok(name)
    }
}

fn expand_template(template: &str, original_name: &str) -> Result<String, String> {
    let extension = file_extension(original_name);
    let basename = file_stem(original_name);
    let date = today_utc();
    safe_filename(
        &template
            .replace("{name}", original_name)
            .replace("{originalName}", original_name)
            .replace("{basename}", &basename)
            .replace("{ext}", &extension)
            .replace("{date}", &date),
    )
}

fn safe_target_dir(root: &Path, target_folder: Option<&str>) -> Result<PathBuf, String> {
    let mut target = root.to_path_buf();
    if let Some(folder) = target_folder.filter(|item| !item.trim().is_empty()) {
        for component in Path::new(folder).components() {
            match component {
                Component::Normal(part) => target.push(part),
                Component::CurDir => {}
                _ => return Err("Target folder must stay inside the watched folder".to_string()),
            }
        }
    }
    Ok(target)
}

fn path_inside(root: &Path, target: &Path) -> bool {
    #[cfg(windows)]
    {
        let root = root.to_string_lossy().replace('/', "\\").to_lowercase();
        let target = target.to_string_lossy().replace('/', "\\").to_lowercase();
        target == root || target.starts_with(&(root.trim_end_matches('\\').to_string() + "\\"))
    }
    #[cfg(not(windows))]
    {
        target == root || target.starts_with(root)
    }
}

fn reject_symlink_ancestors(root: &Path, target_parent: &Path) -> Result<(), String> {
    let relative = target_parent
        .strip_prefix(root)
        .map_err(|_| "Target parent must stay inside the watched folder".to_string())?;
    let mut current = root.to_path_buf();
    for component in relative.components() {
        if let Component::Normal(part) = component {
            current.push(part);
            if let Ok(metadata) = fs::symlink_metadata(&current) {
                if metadata.file_type().is_symlink() {
                    return Err("Target directory resolves through a symlink".to_string());
                }
            }
        }
    }
    Ok(())
}

fn evaluate_rule_action(
    id: String,
    workspace_id: &str,
    folder_path: &Path,
    file_path: &Path,
    file_snapshot: &FileSnapshot,
    rules: &[FileRule],
    metadata: &DownloadMetadata,
) -> RuleAction {
    let original_name = file_path
        .file_name()
        .and_then(|item| item.to_str())
        .unwrap_or("")
        .to_string();
    let extension = file_extension(&original_name);
    let mut trace = Vec::new();
    let mut action = RuleActionConfig::default();
    let mut matched_rule: Option<&FileRule> = None;
    let mut uncertain_reason = None;

    for rule in rules.iter().filter(|rule| rule.enabled) {
        let (matched, uncertain, reasons) = rule_match(rule, &original_name, &extension, metadata);
        trace.push(RuleTraceItem {
            rule_id: rule.id.clone(),
            rule_name: rule.name.clone(),
            matched,
            uncertain,
            reasons: reasons.clone(),
        });
        if !matched {
            continue;
        }

        matched_rule = Some(rule);
        if uncertain {
            uncertain_reason = Some(reasons.join("; "));
            break;
        }

        if rule.action.target_folder.is_some() {
            action.target_folder = rule.action.target_folder.clone();
        }
        if rule.action.target_name_template.is_some() {
            action.target_name_template = rule.action.target_name_template.clone();
        }
        if rule.action.ask.is_some() {
            action.ask = rule.action.ask;
        }
        if rule.stop_on_match.unwrap_or(true) {
            break;
        }
    }

    let timestamp = now_string();
    let mut row = RuleAction {
        id,
        workspace_id: workspace_id.to_string(),
        folder_path: folder_path.to_string_lossy().to_string(),
        file_path: file_path.to_string_lossy().to_string(),
        original_name: original_name.clone(),
        target_path: None,
        target_name: None,
        rule_id: matched_rule.map(|rule| rule.id.clone()),
        rule_name: matched_rule.map(|rule| rule.name.clone()),
        rule_trace: trace,
        status: "pending".to_string(),
        file_size: file_snapshot.size,
        file_mtime_ms: file_snapshot.mtime_ms,
        error_message: None,
        created_at: timestamp.clone(),
        updated_at: timestamp,
    };

    if matched_rule.is_none() {
        row.status = "needs_review".to_string();
        row.error_message = Some("No rule matched".to_string());
        return row;
    }
    if let Some(reason) = uncertain_reason {
        row.status = "needs_review".to_string();
        row.error_message = Some(reason);
        return row;
    }
    if action.ask == Some(true) {
        row.status = "needs_review".to_string();
        row.error_message = Some("Rule is set to ask before acting".to_string());
        return row;
    }

    match build_target_path(folder_path, &original_name, &action) {
        Ok((target_path, target_name)) => {
            if same_path(file_path, &target_path) {
                row.status = "needs_review".to_string();
                row.error_message = Some("Rule does not change this file".to_string());
            } else if target_path.exists() {
                row.status = "conflict".to_string();
                row.error_message = Some("Target already exists".to_string());
            }
            row.target_path = Some(target_path.to_string_lossy().to_string());
            row.target_name = Some(target_name);
        }
        Err(error) => {
            row.status = "error".to_string();
            row.error_message = Some(error);
        }
    }
    row
}

fn build_target_path(
    folder_path: &Path,
    original_name: &str,
    action: &RuleActionConfig,
) -> Result<(PathBuf, String), String> {
    let target_dir = safe_target_dir(folder_path, action.target_folder.as_deref())?;
    let target_name = match action.target_name_template.as_deref() {
        Some(template) if !template.trim().is_empty() => expand_template(template, original_name)?,
        _ => original_name.to_string(),
    };
    Ok((target_dir.join(&target_name), target_name))
}

fn same_path(first: &Path, second: &Path) -> bool {
    #[cfg(windows)]
    {
        first.to_string_lossy().to_lowercase() == second.to_string_lossy().to_lowercase()
    }
    #[cfg(not(windows))]
    {
        first == second
    }
}

fn parse_windows_zone_identifier(content: &str) -> DownloadMetadata {
    let mut values = HashMap::new();
    for line in content.lines() {
        if let Some((key, value)) = line.split_once('=') {
            values.insert(key.trim().to_lowercase(), value.trim().to_string());
        }
    }
    DownloadMetadata {
        source_url: values
            .get("hosturl")
            .or_else(|| values.get("referrerurl"))
            .cloned(),
        downloaded_from: values.get("appname").cloned(),
    }
}

fn read_download_metadata(file_path: &Path) -> DownloadMetadata {
    #[cfg(windows)]
    {
        let stream_path = format!("{}:Zone.Identifier", file_path.to_string_lossy());
        fs::read(stream_path)
            .map(|bytes| {
                if bytes.windows(2).any(|pair| pair == [0, 0]) {
                    let words = bytes
                        .chunks_exact(2)
                        .map(|chunk| u16::from_le_bytes([chunk[0], chunk[1]]))
                        .collect::<Vec<_>>();
                    String::from_utf16_lossy(&words)
                } else {
                    String::from_utf8_lossy(&bytes).to_string()
                }
            })
            .map(|content| parse_windows_zone_identifier(&content))
            .unwrap_or_default()
    }
    #[cfg(not(windows))]
    {
        let _ = file_path;
        DownloadMetadata::default()
    }
}

fn action_id(file_path: &Path, file_snapshot: &FileSnapshot) -> String {
    use std::hash::{Hash, Hasher};
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    file_path.to_string_lossy().hash(&mut hasher);
    file_snapshot.size.hash(&mut hasher);
    file_snapshot.mtime_ms.hash(&mut hasher);
    format!("rule-action-{}-{:x}", now_ms(), hasher.finish())
}

fn terminal_status(status: &str) -> bool {
    matches!(status, "applied" | "skipped" | "stale")
}

fn queue_file(
    store: &mut Store,
    workspace_id: &str,
    folder_path: &Path,
    file_path: &Path,
    file_snapshot: &FileSnapshot,
) -> bool {
    let actions = store
        .rule_actions
        .entry(workspace_id.to_string())
        .or_default();
    if actions.iter().any(|action| {
        action.file_path == file_path.to_string_lossy()
            && action.file_size == file_snapshot.size
            && action.file_mtime_ms == file_snapshot.mtime_ms
    }) {
        return false;
    }

    let rules = normalized_rules(
        store
            .workspace_settings
            .get(workspace_id)
            .and_then(|settings| settings.get(AUTOMATION_RULES_KEY)),
    );
    let row = evaluate_rule_action(
        action_id(file_path, file_snapshot),
        workspace_id,
        folder_path,
        file_path,
        file_snapshot,
        &rules,
        &read_download_metadata(file_path),
    );
    actions.push(row);
    true
}

fn scan_store(store: &mut Store, seen: &mut HashMap<String, FileSnapshot>) -> HashSet<String> {
    let mut changed_workspaces = HashSet::new();
    let mut current_keys = HashSet::new();
    let mut active_keys: HashMap<String, HashSet<String>> = HashMap::new();
    let watch_folders = store.watch_folders.clone();

    for (workspace_id, folders) in watch_folders {
        for folder in folders.into_iter().filter(|folder| folder.enabled) {
            let folder_path = PathBuf::from(&folder.path);
            scan_folder(
                store,
                seen,
                &mut current_keys,
                &mut active_keys,
                &mut changed_workspaces,
                &workspace_id,
                &folder_path,
                &folder_path,
                folder.recursive,
            );
        }
    }

    mark_out_of_scope_actions_stale(store, &active_keys, &mut changed_workspaces);
    seen.retain(|key, _| current_keys.contains(key));
    changed_workspaces
}

// ponytail: scanning shares this state; extract a context struct if this grows.
#[allow(clippy::too_many_arguments)]
fn scan_folder(
    store: &mut Store,
    seen: &mut HashMap<String, FileSnapshot>,
    current_keys: &mut HashSet<String>,
    active_keys: &mut HashMap<String, HashSet<String>>,
    changed_workspaces: &mut HashSet<String>,
    workspace_id: &str,
    folder_path: &Path,
    current_path: &Path,
    recursive: bool,
) {
    let Ok(entries) = fs::read_dir(current_path) else {
        return;
    };

    for entry in entries.flatten() {
        let file_path = entry.path();
        let key = format!("{workspace_id}:{}", file_path.to_string_lossy());
        current_keys.insert(key.clone());
        active_keys
            .entry(workspace_id.to_string())
            .or_default()
            .insert(key.clone());

        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        if file_type.is_symlink() {
            continue;
        }
        if file_type.is_dir() {
            if recursive {
                scan_folder(
                    store,
                    seen,
                    current_keys,
                    active_keys,
                    changed_workspaces,
                    workspace_id,
                    folder_path,
                    &file_path,
                    recursive,
                );
            }
            continue;
        }
        if !file_type.is_file() {
            continue;
        }
        let Ok(metadata) = entry.metadata() else {
            continue;
        };
        let next_snapshot = snapshot(&metadata);
        if seen.get(&key) == Some(&next_snapshot)
            && queue_file(store, workspace_id, folder_path, &file_path, &next_snapshot)
        {
            changed_workspaces.insert(workspace_id.to_string());
        }
        seen.insert(key, next_snapshot);
    }
}

fn mark_out_of_scope_actions_stale(
    store: &mut Store,
    active_keys: &HashMap<String, HashSet<String>>,
    changed_workspaces: &mut HashSet<String>,
) {
    for (workspace_id, actions) in store.rule_actions.iter_mut() {
        let workspace_keys = active_keys.get(workspace_id);
        for action in actions.iter_mut() {
            if terminal_status(&action.status) {
                continue;
            }
            let key = format!("{workspace_id}:{}", action.file_path);
            if workspace_keys
                .map(|keys| keys.contains(&key))
                .unwrap_or(false)
            {
                continue;
            }
            if action.status == "stale" {
                continue;
            }
            action.status = "stale".to_string();
            action.error_message = Some("File is no longer in the watched scope".to_string());
            action.updated_at = now_string();
            changed_workspaces.insert(workspace_id.clone());
        }
    }
}

fn scan_once(app: &AppHandle, seen: &mut HashMap<String, FileSnapshot>) -> Result<(), String> {
    let _guard = store_guard()?;
    let mut store = load_store(app)?;
    let changed_workspaces = scan_store(&mut store, seen);
    if !changed_workspaces.is_empty() {
        save_store(app, &store)?;
        set_tray_menu(app, pending_rename_count(&store))?;
        for workspace_id in changed_workspaces {
            let _ = app.emit(
                "rule-actions-changed",
                json!({ "workspaceId": workspace_id }),
            );
        }
    }
    Ok(())
}

fn start_watcher(app: AppHandle) {
    thread::spawn(move || {
        let mut seen = HashMap::new();
        loop {
            if let Err(error) = scan_once(&app, &mut seen) {
                eprintln!("watch scan failed: {error}");
            }
            thread::sleep(WATCH_INTERVAL);
        }
    });
}

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn pending_rename_count(store: &Store) -> usize {
    store
        .rule_actions
        .values()
        .flatten()
        .filter(|action| action.status == "pending")
        .count()
}

fn tray_menu(app: &AppHandle, pending_count: usize) -> tauri::Result<Menu<tauri::Wry>> {
    let status = MenuItem::with_id(
        app,
        "pending_status",
        format!("Pending renames: {pending_count}"),
        false,
        None::<&str>,
    )?;
    let rename = MenuItem::with_id(
        app,
        "rename_pending",
        if pending_count == 1 {
            "Rename 1 pending file".to_string()
        } else {
            format!("Rename {pending_count} pending files")
        },
        pending_count > 0,
        None::<&str>,
    )?;
    let startup = CheckMenuItem::with_id(
        app,
        "toggle_startup",
        "Open on startup",
        true,
        app.autolaunch().is_enabled().unwrap_or(false),
        None::<&str>,
    )?;
    let updates = MenuItem::with_id(
        app,
        "check_updates",
        "Check for updates",
        true,
        None::<&str>,
    )?;
    let show = MenuItem::with_id(app, "show", "Show KeepDir", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    Menu::with_items(
        app,
        &[
            &status, &rename, &startup, &updates, &separator, &show, &quit,
        ],
    )
}

fn set_tray_menu(app: &AppHandle, pending_count: usize) -> Result<(), String> {
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let menu = tray_menu(app, pending_count).map_err(|error| error.to_string())?;
        tray.set_menu(Some(menu))
            .map_err(|error| error.to_string())?;
        tray.set_tooltip(Some(format!("KeepDir - {pending_count} pending renames")))
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn update_tray_menu(app: &AppHandle) -> Result<(), String> {
    let store = load_store(app)?;
    set_tray_menu(app, pending_rename_count(&store))
}

fn toggle_startup(app: &AppHandle) -> Result<(), String> {
    let autolaunch = app.autolaunch();
    if autolaunch.is_enabled().map_err(|error| error.to_string())? {
        autolaunch.disable().map_err(|error| error.to_string())?;
    } else {
        autolaunch.enable().map_err(|error| error.to_string())?;
    }
    update_tray_menu(app)
}

fn apply_pending_rule_actions(app: &AppHandle) -> Result<(), String> {
    let _guard = store_guard()?;
    let mut store = load_store(app)?;
    let mut changed_workspaces = HashSet::new();
    for (workspace_id, actions) in store.rule_actions.iter_mut() {
        for action in actions
            .iter_mut()
            .filter(|action| action.status == "pending")
        {
            let _ = apply_one(action);
            changed_workspaces.insert(workspace_id.clone());
        }
    }
    save_store(app, &store)?;
    set_tray_menu(app, pending_rename_count(&store))?;
    for workspace_id in changed_workspaces {
        let _ = app.emit(
            "rule-actions-changed",
            json!({ "workspaceId": workspace_id }),
        );
    }
    Ok(())
}

fn setup_tray(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let pending_count = load_store(app.handle())
        .map(|store| pending_rename_count(&store))
        .unwrap_or(0);
    let menu = tray_menu(app.handle(), pending_count)?;
    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
        .tooltip(format!("KeepDir - {pending_count} pending renames"))
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_main_window(app),
            "rename_pending" => {
                if let Err(error) = apply_pending_rule_actions(app) {
                    eprintln!("failed to apply pending renames from tray: {error}");
                }
            }
            "toggle_startup" => {
                if let Err(error) = toggle_startup(app) {
                    eprintln!("failed to toggle startup from tray: {error}");
                }
            }
            "check_updates" => {
                show_main_window(app);
                let _ = app.emit("check-updates-requested", json!({}));
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
}

fn rule_assistant_key_entry(provider: &str) -> Result<keyring::Entry, String> {
    match provider {
        "openai" | "google" | "anthropic" | "openrouter" | "lmstudio" | "ollama" => {
            keyring::Entry::new(KEYCHAIN_SERVICE, provider).map_err(|error| error.to_string())
        }
        _ => Err("Unknown rule assistant provider".to_string()),
    }
}

fn open_url(url: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    let status = std::process::Command::new("cmd")
        .args(["/C", "start", "", url])
        .status();

    #[cfg(target_os = "macos")]
    let status = std::process::Command::new("open").arg(url).status();

    #[cfg(all(unix, not(target_os = "macos")))]
    let status = std::process::Command::new("xdg-open").arg(url).status();

    match status {
        Ok(status) if status.success() => Ok(()),
        Ok(status) => Err(format!("Failed to open release page: {status}")),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[tauri::command]
fn open_latest_release() -> Result<Value, String> {
    open_url(LATEST_RELEASE_URL)?;
    Ok(json!({ "success": true }))
}

#[tauri::command]
fn get_rule_assistant_key(provider: String) -> Result<Value, String> {
    let entry = rule_assistant_key_entry(&provider)?;
    match entry.get_password() {
        Ok(api_key) => Ok(json!({ "success": true, "apiKey": api_key })),
        Err(keyring::Error::NoEntry) => Ok(json!({ "success": true, "apiKey": Value::Null })),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
fn save_rule_assistant_key(provider: String, api_key: String) -> Result<Value, String> {
    let api_key = api_key.trim();
    if api_key.is_empty() {
        return delete_rule_assistant_key(provider);
    }
    rule_assistant_key_entry(&provider)?
        .set_password(api_key)
        .map_err(|error| error.to_string())?;
    Ok(json!({ "success": true }))
}

#[tauri::command]
fn delete_rule_assistant_key(provider: String) -> Result<Value, String> {
    let entry = rule_assistant_key_entry(&provider)?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(json!({ "success": true })),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
fn load_settings(app: AppHandle) -> Result<Value, String> {
    let _guard = store_guard()?;
    let store = load_store(&app)?;
    Ok(json!({ "settings": store.settings }))
}

#[tauri::command]
fn save_settings(app: AppHandle, settings: Value) -> Result<Value, String> {
    let _guard = store_guard()?;
    let mut store = load_store(&app)?;
    store.settings = settings;
    save_store(&app, &store)?;
    Ok(json!({ "success": true }))
}

#[tauri::command]
fn get_workspace_setting(
    app: AppHandle,
    workspace_id: String,
    key: String,
) -> Result<Value, String> {
    let _guard = store_guard()?;
    let store = load_store(&app)?;
    Ok(store
        .workspace_settings
        .get(&workspace_id)
        .and_then(|settings| settings.get(&key))
        .cloned()
        .unwrap_or(Value::Null))
}

#[tauri::command]
fn save_workspace_setting(
    app: AppHandle,
    workspace_id: String,
    key: String,
    value: Value,
) -> Result<Value, String> {
    let _guard = store_guard()?;
    let mut store = load_store(&app)?;
    store
        .workspace_settings
        .entry(workspace_id.clone())
        .or_default()
        .insert(key, value);
    save_store(&app, &store)?;
    let _ = app.emit(
        "rule-actions-changed",
        json!({ "workspaceId": workspace_id }),
    );
    Ok(json!({ "success": true }))
}

#[tauri::command]
fn get_watch_folders(app: AppHandle, workspace_id: String) -> Result<Value, String> {
    let _guard = store_guard()?;
    let store = load_store(&app)?;
    Ok(json!({
        "success": true,
        "folders": store.watch_folders.get(&workspace_id).cloned().unwrap_or_default()
    }))
}

#[tauri::command]
fn save_watch_folder(
    app: AppHandle,
    workspace_id: String,
    folder: WatchFolder,
) -> Result<Value, String> {
    let _guard = store_guard()?;
    let mut store = load_store(&app)?;
    let folders = store.watch_folders.entry(workspace_id.clone()).or_default();
    if let Some(existing) = folders.iter_mut().find(|item| item.id == folder.id) {
        *existing = folder.clone();
    } else {
        folders.push(folder.clone());
    }
    save_store(&app, &store)?;
    let _ = app.emit(
        "watch-folders-changed",
        json!({ "workspaceId": workspace_id }),
    );
    Ok(json!({ "success": true, "folder": folder }))
}

#[tauri::command]
fn remove_watch_folder(
    app: AppHandle,
    workspace_id: String,
    folder_id: String,
) -> Result<Value, String> {
    let _guard = store_guard()?;
    let mut store = load_store(&app)?;
    if let Some(folders) = store.watch_folders.get_mut(&workspace_id) {
        folders.retain(|folder| folder.id != folder_id);
    }
    save_store(&app, &store)?;
    let _ = app.emit(
        "watch-folders-changed",
        json!({ "workspaceId": workspace_id }),
    );
    Ok(json!({ "success": true }))
}

#[tauri::command]
fn set_watch_folder_enabled(
    app: AppHandle,
    workspace_id: String,
    folder_id: String,
    enabled: bool,
) -> Result<Value, String> {
    let _guard = store_guard()?;
    let mut store = load_store(&app)?;
    if let Some(folders) = store.watch_folders.get_mut(&workspace_id) {
        if let Some(folder) = folders.iter_mut().find(|item| item.id == folder_id) {
            folder.enabled = enabled;
        }
    }
    save_store(&app, &store)?;
    let _ = app.emit(
        "watch-folders-changed",
        json!({ "workspaceId": workspace_id }),
    );
    Ok(json!({ "success": true }))
}

#[tauri::command]
fn get_rule_actions(
    app: AppHandle,
    workspace_id: String,
    include_history: Option<bool>,
) -> Result<Value, String> {
    let _guard = store_guard()?;
    let store = load_store(&app)?;
    let mut actions = store
        .rule_actions
        .get(&workspace_id)
        .cloned()
        .unwrap_or_default();
    if include_history != Some(true) {
        actions.retain(|action| !terminal_status(&action.status));
    }
    Ok(json!({ "success": true, "actions": actions }))
}

#[tauri::command]
fn skip_rule_actions(
    app: AppHandle,
    workspace_id: String,
    action_ids: Vec<String>,
) -> Result<Value, String> {
    update_rule_action_status(app, workspace_id, action_ids, "skipped")
}

#[tauri::command]
fn refresh_rule_actions(
    app: AppHandle,
    workspace_id: String,
    action_ids: Vec<String>,
) -> Result<Value, String> {
    let _guard = store_guard()?;
    let mut store = load_store(&app)?;
    let selected: Vec<RuleAction> = store
        .rule_actions
        .get(&workspace_id)
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .filter(|action| action_ids.iter().any(|id| id == &action.id))
        .collect();

    if let Some(actions) = store.rule_actions.get_mut(&workspace_id) {
        actions.retain(|action| !action_ids.iter().any(|id| id == &action.id));
    }
    for action in selected {
        let file_path = PathBuf::from(&action.file_path);
        match fs::symlink_metadata(&file_path) {
            Ok(metadata) if metadata.is_file() && !metadata.file_type().is_symlink() => {
                let file_snapshot = snapshot(&metadata);
                queue_file(
                    &mut store,
                    &workspace_id,
                    Path::new(&action.folder_path),
                    &file_path,
                    &file_snapshot,
                );
            }
            _ => {
                let mut stale = action;
                stale.status = "stale".to_string();
                stale.error_message = Some("File changed since action was generated".to_string());
                stale.updated_at = now_string();
                store
                    .rule_actions
                    .entry(workspace_id.clone())
                    .or_default()
                    .push(stale);
            }
        }
    }
    save_store(&app, &store)?;
    set_tray_menu(&app, pending_rename_count(&store))?;
    let _ = app.emit(
        "rule-actions-changed",
        json!({ "workspaceId": workspace_id }),
    );
    Ok(json!({ "success": true }))
}

#[tauri::command]
fn apply_rule_actions(
    app: AppHandle,
    workspace_id: String,
    action_ids: Vec<String>,
) -> Result<Value, String> {
    let _guard = store_guard()?;
    let mut store = load_store(&app)?;
    let mut results = Vec::new();
    if let Some(actions) = store.rule_actions.get_mut(&workspace_id) {
        for action in actions
            .iter_mut()
            .filter(|action| action_ids.iter().any(|id| id == &action.id))
        {
            let result = apply_one(action);
            results.push(json!({
                "id": action.id,
                "success": result.is_ok(),
                "error": result.err()
            }));
        }
    }
    save_store(&app, &store)?;
    set_tray_menu(&app, pending_rename_count(&store))?;
    let _ = app.emit(
        "rule-actions-changed",
        json!({ "workspaceId": workspace_id }),
    );
    Ok(json!({ "success": true, "results": results }))
}

fn update_rule_action_status(
    app: AppHandle,
    workspace_id: String,
    action_ids: Vec<String>,
    status: &str,
) -> Result<Value, String> {
    let _guard = store_guard()?;
    let mut store = load_store(&app)?;
    if let Some(actions) = store.rule_actions.get_mut(&workspace_id) {
        for action in actions
            .iter_mut()
            .filter(|action| action_ids.iter().any(|id| id == &action.id))
        {
            action.status = status.to_string();
            action.error_message = None;
            action.updated_at = now_string();
        }
    }
    save_store(&app, &store)?;
    set_tray_menu(&app, pending_rename_count(&store))?;
    let _ = app.emit(
        "rule-actions-changed",
        json!({ "workspaceId": workspace_id }),
    );
    Ok(json!({ "success": true }))
}

fn apply_one(action: &mut RuleAction) -> Result<(), String> {
    let Some(target_path) = action.target_path.clone() else {
        action.status = "needs_review".to_string();
        action.error_message = Some("Action has no target path".to_string());
        action.updated_at = now_string();
        return Err("Action has no target path".to_string());
    };
    if action.status != "pending" {
        return Err("Action is not ready to apply".to_string());
    }

    let file_path = PathBuf::from(&action.file_path);
    let metadata = match fs::symlink_metadata(&file_path) {
        Ok(metadata) => metadata,
        Err(_) => {
            mark_stale(action);
            return Err("File changed since action was generated".to_string());
        }
    };
    let current_snapshot = snapshot(&metadata);
    if !metadata.is_file()
        || metadata.file_type().is_symlink()
        || current_snapshot.size != action.file_size
        || current_snapshot.mtime_ms != action.file_mtime_ms
    {
        mark_stale(action);
        return Err("File changed since action was generated".to_string());
    }

    let folder_path = PathBuf::from(&action.folder_path);
    let target_path = PathBuf::from(target_path);
    if target_path
        .components()
        .any(|component| matches!(component, Component::ParentDir))
    {
        action.status = "error".to_string();
        action.error_message = Some("Target path must stay inside the watched folder".to_string());
        action.updated_at = now_string();
        return Err("Target path must stay inside the watched folder".to_string());
    }
    if !path_inside(&folder_path, &target_path) {
        action.status = "error".to_string();
        action.error_message = Some("Target path must stay inside the watched folder".to_string());
        action.updated_at = now_string();
        return Err("Target path must stay inside the watched folder".to_string());
    }
    if same_path(&file_path, &target_path) {
        action.status = "needs_review".to_string();
        action.error_message = Some("Rule does not change this file".to_string());
        action.updated_at = now_string();
        return Err("Rule does not change this file".to_string());
    }
    if target_path.exists() {
        action.status = "conflict".to_string();
        action.error_message = Some("Target already exists".to_string());
        action.updated_at = now_string();
        return Err("Target already exists".to_string());
    }

    let Some(parent) = target_path.parent() else {
        return mark_apply_error(action, "Target path has no parent directory".to_string());
    };
    if let Err(error) = reject_symlink_ancestors(&folder_path, parent) {
        return mark_apply_error(action, error);
    }
    if let Err(error) = fs::create_dir_all(parent) {
        return mark_apply_error(action, error.to_string());
    }
    if let Err(error) = fs::rename(&file_path, &target_path) {
        return mark_apply_error(action, error.to_string());
    }
    action.status = "applied".to_string();
    action.error_message = None;
    action.updated_at = now_string();
    Ok(())
}

fn mark_apply_error(action: &mut RuleAction, message: String) -> Result<(), String> {
    action.status = "error".to_string();
    action.error_message = Some(message.clone());
    action.updated_at = now_string();
    Err(message)
}

fn mark_stale(action: &mut RuleAction) {
    action.status = "stale".to_string();
    action.error_message = Some("File changed since action was generated".to_string());
    action.updated_at = now_string();
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            None,
        ))
        .setup(|app| {
            setup_tray(app)?;
            start_watcher(app.handle().clone());
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            load_settings,
            save_settings,
            get_rule_assistant_key,
            save_rule_assistant_key,
            delete_rule_assistant_key,
            get_workspace_setting,
            save_workspace_setting,
            get_watch_folders,
            save_watch_folder,
            remove_watch_folder,
            set_watch_folder_enabled,
            get_rule_actions,
            apply_rule_actions,
            skip_rule_actions,
            refresh_rule_actions,
            get_app_version,
            open_latest_release
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rule(extension: &str, target: &str) -> FileRule {
        FileRule {
            id: "rule-1".to_string(),
            name: "Docs".to_string(),
            enabled: true,
            order: 0,
            rule_match: RuleMatch {
                extension_in: vec![extension.to_string()],
                ..RuleMatch::default()
            },
            action: RuleActionConfig {
                target_folder: Some(target.to_string()),
                ..RuleActionConfig::default()
            },
            stop_on_match: Some(true),
        }
    }

    fn temp_root(name: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!(
            "keepdir-{name}-{}-{}",
            std::process::id(),
            now_ms()
        ));
        fs::create_dir_all(&path).unwrap();
        path
    }

    #[test]
    fn rejects_unknown_rule_assistant_provider() {
        assert!(rule_assistant_key_entry("not-a-provider").is_err());
    }

    fn pending_action(root: &Path, source: &Path, target: &Path) -> RuleAction {
        let file_snapshot = snapshot(&fs::metadata(source).unwrap());
        RuleAction {
            id: "id".to_string(),
            workspace_id: "default".to_string(),
            folder_path: root.to_string_lossy().to_string(),
            file_path: source.to_string_lossy().to_string(),
            original_name: source.file_name().unwrap().to_string_lossy().to_string(),
            target_path: Some(target.to_string_lossy().to_string()),
            target_name: target
                .file_name()
                .map(|item| item.to_string_lossy().to_string()),
            rule_id: Some("rule-1".to_string()),
            rule_name: Some("Docs".to_string()),
            rule_trace: Vec::new(),
            status: "pending".to_string(),
            file_size: file_snapshot.size,
            file_mtime_ms: file_snapshot.mtime_ms,
            error_message: None,
            created_at: now_string(),
            updated_at: now_string(),
        }
    }

    #[test]
    fn queue_file_creates_rule_action_once() {
        let root = temp_root("queue");
        let source = root.join("invoice.pdf");
        fs::write(&source, "a").unwrap();
        let file_snapshot = snapshot(&fs::metadata(&source).unwrap());
        let mut store = Store::default();
        store.workspace_settings.insert(
            "default".to_string(),
            HashMap::from([(
                AUTOMATION_RULES_KEY.to_string(),
                serde_json::to_value(vec![rule("pdf", "Documents")]).unwrap(),
            )]),
        );

        assert!(queue_file(
            &mut store,
            "default",
            &root,
            &source,
            &file_snapshot
        ));
        assert!(!queue_file(
            &mut store,
            "default",
            &root,
            &source,
            &file_snapshot
        ));
        assert_eq!(store.rule_actions["default"].len(), 1);
        assert_eq!(store.rule_actions["default"][0].status, "pending");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn scanner_queues_only_after_file_is_stable() {
        let root = temp_root("scan");
        let source = root.join("invoice.pdf");
        fs::write(&source, "a").unwrap();
        let mut store = Store::default();
        store.watch_folders.insert(
            "default".to_string(),
            vec![WatchFolder {
                id: "watch-1".to_string(),
                path: root.to_string_lossy().to_string(),
                enabled: true,
                created_at: None,
                recursive: false,
            }],
        );
        store.workspace_settings.insert(
            "default".to_string(),
            HashMap::from([(
                AUTOMATION_RULES_KEY.to_string(),
                serde_json::to_value(vec![rule("pdf", "Documents")]).unwrap(),
            )]),
        );
        let mut seen = HashMap::new();

        assert!(scan_store(&mut store, &mut seen).is_empty());
        assert_eq!(
            scan_store(&mut store, &mut seen),
            HashSet::from(["default".to_string()])
        );
        assert_eq!(store.rule_actions["default"].len(), 1);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn recursive_action_becomes_stale_when_folder_scope_restricts_scan() {
        let root = temp_root("scan-scope");
        let nested = root.join("nested");
        fs::create_dir_all(&nested).unwrap();
        let source = nested.join("invoice.pdf");
        fs::write(&source, "a").unwrap();

        let mut store = Store::default();
        store.watch_folders.insert(
            "default".to_string(),
            vec![WatchFolder {
                id: "watch-1".to_string(),
                path: root.to_string_lossy().to_string(),
                enabled: true,
                created_at: None,
                recursive: true,
            }],
        );
        store.workspace_settings.insert(
            "default".to_string(),
            HashMap::from([(
                AUTOMATION_RULES_KEY.to_string(),
                serde_json::to_value(vec![rule("pdf", "Documents")]).unwrap(),
            )]),
        );
        let mut seen = HashMap::new();

        assert_eq!(scan_store(&mut store, &mut seen), HashSet::new());
        assert_eq!(
            scan_store(&mut store, &mut seen),
            HashSet::from(["default".to_string()])
        );
        assert_eq!(store.rule_actions["default"].len(), 1);
        assert_eq!(store.rule_actions["default"][0].status, "pending");

        if let Some(folders) = store.watch_folders.get_mut("default") {
            folders[0].recursive = false;
        }

        assert_eq!(
            scan_store(&mut store, &mut seen),
            HashSet::from(["default".to_string()])
        );
        assert_eq!(store.rule_actions["default"][0].status, "stale");
        assert_eq!(
            store.rule_actions["default"][0].error_message.as_deref(),
            Some("File is no longer in the watched scope")
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn evaluates_matching_rule_to_pending_target() {
        let root = PathBuf::from("C:\\watched");
        let file = root.join("invoice.pdf");
        let row = evaluate_rule_action(
            "id".to_string(),
            "default",
            &root,
            &file,
            &FileSnapshot {
                size: 1,
                mtime_ms: 2,
            },
            &[rule("pdf", "Documents")],
            &DownloadMetadata::default(),
        );

        assert_eq!(row.status, "pending");
        assert!(row.target_path.unwrap().ends_with("Documents\\invoice.pdf"));
    }

    #[test]
    fn asks_when_no_rule_matches() {
        let root = PathBuf::from("C:\\watched");
        let file = root.join("photo.png");
        let row = evaluate_rule_action(
            "id".to_string(),
            "default",
            &root,
            &file,
            &FileSnapshot {
                size: 1,
                mtime_ms: 2,
            },
            &[rule("pdf", "Documents")],
            &DownloadMetadata::default(),
        );

        assert_eq!(row.status, "needs_review");
        assert_eq!(row.error_message.as_deref(), Some("No rule matched"));
    }

    #[test]
    fn ask_rule_needs_review_without_target() {
        let root = PathBuf::from("C:\\watched");
        let file = root.join("invoice.pdf");
        let mut rule = rule("pdf", "Documents");
        rule.action.ask = Some(true);

        let row = evaluate_rule_action(
            "id".to_string(),
            "default",
            &root,
            &file,
            &FileSnapshot {
                size: 1,
                mtime_ms: 2,
            },
            &[rule],
            &DownloadMetadata::default(),
        );

        assert_eq!(row.status, "needs_review");
        assert_eq!(
            row.error_message.as_deref(),
            Some("Rule is set to ask before acting")
        );
    }

    #[test]
    fn continue_rule_allows_later_rule_to_override_action_fields() {
        let root = PathBuf::from("C:\\watched");
        let file = root.join("Invoice.PDF");
        let mut first = rule("pdf", "Documents");
        first.stop_on_match = Some(false);
        let mut second = rule("pdf", "");
        second.id = "rule-2".to_string();
        second.name = "Rename".to_string();
        second.order = 1;
        second.action.target_folder = None;
        second.action.target_name_template = Some("{basename}-{date}.{ext}".to_string());

        let row = evaluate_rule_action(
            "id".to_string(),
            "default",
            &root,
            &file,
            &FileSnapshot {
                size: 1,
                mtime_ms: 2,
            },
            &[first, second],
            &DownloadMetadata::default(),
        );

        assert_eq!(row.status, "pending");
        assert_eq!(row.rule_name.as_deref(), Some("Rename"));
        assert_eq!(row.rule_trace.iter().filter(|item| item.matched).count(), 2);
        let target = row.target_path.unwrap();
        assert!(target.contains("Documents"));
        assert!(target.ends_with(".pdf"));
    }

    #[test]
    fn metadata_match_can_drive_a_pending_action() {
        let root = PathBuf::from("C:\\watched");
        let file = root.join("download.bin");
        let mut rule = rule("", "Downloads");
        rule.rule_match.extension_in.clear();
        rule.rule_match.source_url_contains = Some("example.com".to_string());

        let row = evaluate_rule_action(
            "id".to_string(),
            "default",
            &root,
            &file,
            &FileSnapshot {
                size: 1,
                mtime_ms: 2,
            },
            &[rule],
            &DownloadMetadata {
                source_url: Some("https://example.com/file".to_string()),
                downloaded_from: None,
            },
        );

        assert_eq!(row.status, "pending");
        assert!(row.target_path.unwrap().contains("Downloads"));
    }

    #[test]
    fn missing_metadata_becomes_uncertain_review() {
        let root = PathBuf::from("C:\\watched");
        let file = root.join("download.bin");
        let mut rule = rule("", "Downloads");
        rule.rule_match.extension_in.clear();
        rule.rule_match.downloaded_from_contains = Some("Chrome".to_string());

        let row = evaluate_rule_action(
            "id".to_string(),
            "default",
            &root,
            &file,
            &FileSnapshot {
                size: 1,
                mtime_ms: 2,
            },
            &[rule],
            &DownloadMetadata::default(),
        );

        assert_eq!(row.status, "needs_review");
        assert_eq!(
            row.error_message.as_deref(),
            Some("downloaded-from metadata unavailable")
        );
    }

    #[test]
    fn rejects_target_traversal() {
        let root = PathBuf::from("C:\\watched");
        let result = build_target_path(
            &root,
            "invoice.pdf",
            &RuleActionConfig {
                target_folder: Some("..\\outside".to_string()),
                ..RuleActionConfig::default()
            },
        );

        assert!(result.is_err());
    }

    #[cfg(windows)]
    #[test]
    fn apply_rejects_symlink_target_directory() {
        use std::os::windows::fs::symlink_dir;

        let root = temp_root("symlink");
        let outside = temp_root("symlink-outside");
        let link = root.join("Linked");
        if symlink_dir(&outside, &link).is_err() {
            fs::remove_dir_all(root).unwrap();
            fs::remove_dir_all(outside).unwrap();
            return;
        }
        let source = root.join("invoice.pdf");
        let target = link.join("invoice.pdf");
        fs::write(&source, "a").unwrap();
        let mut action = pending_action(&root, &source, &target);

        assert!(apply_one(&mut action).is_err());
        assert_eq!(
            action.error_message.as_deref(),
            Some("Target directory resolves through a symlink")
        );
        assert!(source.exists());
        fs::remove_dir_all(root).unwrap();
        fs::remove_dir_all(outside).unwrap();
    }

    #[test]
    fn apply_rejects_tampered_parent_dir_target() {
        let root = temp_root("apply-traversal");
        let source = root.join("invoice.pdf");
        let target = root.join("..").join("outside").join("invoice.pdf");
        fs::write(&source, "a").unwrap();
        let mut action = pending_action(&root, &source, &target);

        assert!(apply_one(&mut action).is_err());
        assert_eq!(action.status, "error");
        assert_eq!(
            action.error_message.as_deref(),
            Some("Target path must stay inside the watched folder")
        );
        assert!(source.exists());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn apply_marks_error_when_target_parent_is_a_file() {
        let root = temp_root("parent-file");
        let source = root.join("invoice.pdf");
        let parent_file = root.join("Documents");
        let target = parent_file.join("invoice.pdf");
        fs::write(&source, "a").unwrap();
        fs::write(&parent_file, "not a directory").unwrap();
        let mut action = pending_action(&root, &source, &target);

        assert!(apply_one(&mut action).is_err());
        assert_eq!(action.status, "error");
        assert!(action.error_message.is_some());
        assert!(source.exists());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn apply_moves_pending_file() {
        let root = temp_root("apply");
        let source = root.join("invoice.pdf");
        let target = root.join("Documents").join("invoice.pdf");
        fs::write(&source, "a").unwrap();
        let mut action = pending_action(&root, &source, &target);

        assert!(apply_one(&mut action).is_ok());
        assert_eq!(action.status, "applied");
        assert!(!source.exists());
        assert!(target.exists());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn apply_marks_conflict_without_overwriting() {
        let root = temp_root("conflict");
        let source = root.join("invoice.pdf");
        let target = root.join("Documents").join("invoice.pdf");
        fs::create_dir_all(target.parent().unwrap()).unwrap();
        fs::write(&source, "a").unwrap();
        fs::write(&target, "existing").unwrap();
        let mut action = pending_action(&root, &source, &target);

        assert!(apply_one(&mut action).is_err());
        assert_eq!(action.status, "conflict");
        assert_eq!(fs::read_to_string(&target).unwrap(), "existing");
        assert!(source.exists());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn apply_marks_stale_when_file_changed() {
        let root = temp_root("stale");
        let source = root.join("invoice.pdf");
        let target = root.join("Documents").join("invoice.pdf");
        fs::write(&source, "a").unwrap();
        let mut action = pending_action(&root, &source, &target);
        fs::write(&source, "changed").unwrap();

        assert!(apply_one(&mut action).is_err());
        assert_eq!(action.status, "stale");
        assert!(source.exists());
        assert!(!target.exists());
        fs::remove_dir_all(root).unwrap();
    }
}
