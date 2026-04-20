//! MCP 侧「项目引擎」：与原 Node `project-engine` 行为对齐的实现（现仅在 Rust 中维护）。

use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use tokio::fs;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSnapshot {
    pub project_path: Option<String>,
    #[serde(flatten)]
    pub project: ProjectData,
    pub diagnostics: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectData {
    pub widgets: Vec<serde_json::Value>,
    pub settings: serde_json::Value,
    pub resources: Vec<serde_json::Value>,
    pub animations: Vec<serde_json::Value>,
    pub next_anim_id: i64,
    pub export_config: serde_json::Value,
}

fn default_project() -> ProjectData {
    serde_json::from_value(json!({
        "widgets": [],
        "settings": {
            "canvasWidth": 1920,
            "canvasHeight": 1080,
            "rulerStep": 64,
            "gridSnapStep": 16,
            "autoSave": false,
            "controlPanelWidth": 220,
            "canvasBgColor": "#1a1a1a",
            "canvasBgImage": ""
        },
        "resources": [],
        "animations": [],
        "nextAnimId": 1,
        "exportConfig": {
            "exportResourcesEnabled": false,
            "exportResourcesPath": "",
            "exportCodeEnabled": true,
            "exportCodePath": "",
            "selectedExportPlugin": "json-structured-export",
            "exportPlugins": []
        }
    }))
    .expect("default project")
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditEvent {
    pub session_id: String,
    pub action_id: String,
    #[serde(rename = "type")]
    pub action_type: String,
    pub at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dry_run: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransactionAuditEvent {
    pub transaction_id: String,
    pub session_id: String,
    pub phase: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub action_count: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub at: Option<String>,
}

pub struct ProjectEngine {
    project: ProjectData,
    project_path: Option<PathBuf>,
    action_audit: Vec<AuditEvent>,
    transaction_audit: Vec<TransactionAuditEvent>,
}

impl ProjectEngine {
    pub fn new() -> Self {
        Self {
            project: default_project(),
            project_path: None,
            action_audit: Vec::new(),
            transaction_audit: Vec::new(),
        }
    }

    pub async fn open_project(&mut self, project_path: String) -> Result<ProjectSnapshot, String> {
        let raw = fs::read_to_string(&project_path)
            .await
            .map_err(|e| e.to_string())?;
        let parsed: serde_json::Value =
            serde_json::from_str(&raw).map_err(|e| e.to_string())?;
        let mut base = serde_json::to_value(default_project()).map_err(|e| e.to_string())?;
        shallow_merge(&mut base, parsed);
        self.project = serde_json::from_value(base).map_err(|e| e.to_string())?;
        self.project_path = Some(PathBuf::from(project_path));
        Ok(self.get_snapshot())
    }

    pub async fn save_project(&mut self, project_path: Option<String>) -> Result<serde_json::Value, String> {
        let path = project_path
            .or_else(|| self.project_path.as_ref().map(|p| p.to_string_lossy().to_string()))
            .ok_or_else(|| "projectPath is required".to_string())?;
        let data = serde_json::to_string_pretty(&self.project).map_err(|e| e.to_string())?;
        fs::write(&path, data)
            .await
            .map_err(|e| e.to_string())?;
        self.project_path = Some(PathBuf::from(&path));
        Ok(json!({ "path": path }))
    }

    /// 从 codegen.mjs 写出的 `*.ui.json` sidecar 恢复项目快照。
    ///
    /// 期望的 sidecar 形状（来自 wc3-template-export）：
    ///   {
    ///     "version": 1,
    ///     "generator": "wc3-template-export",
    ///     "widgets":  [ ...flat widget list... ],
    ///     "settings": { canvasWidth, canvasHeight, ... } | null,
    ///     "animations": { [widgetId]: [...] },
    ///     ...
    ///   }
    ///
    /// 无歧义地只接受 sidecar 格式——避免解析 TS AST。
    pub async fn import_from_sidecar(
        &mut self,
        sidecar_path: String,
    ) -> Result<ProjectSnapshot, String> {
        let raw = fs::read_to_string(&sidecar_path)
            .await
            .map_err(|e| e.to_string())?;
        let sidecar: serde_json::Value =
            serde_json::from_str(&raw).map_err(|e| format!("sidecar JSON 解析失败: {}", e))?;

        let generator = sidecar
            .get("generator")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        if generator != "wc3-template-export" {
            return Err(format!(
                "sidecar generator 不匹配（期望 wc3-template-export，得到 \"{}\"）",
                generator
            ));
        }
        let widgets = sidecar
            .get("widgets")
            .and_then(|v| v.as_array())
            .ok_or_else(|| "sidecar 缺少 widgets 数组".to_string())?
            .clone();

        // 以 default_project 为底，再按 sidecar 覆盖，保证其他字段（exportConfig 等）不丢失
        let mut base = serde_json::to_value(default_project()).map_err(|e| e.to_string())?;
        if let Some(obj) = base.as_object_mut() {
            obj.insert("widgets".into(), serde_json::Value::Array(widgets));
            if let Some(settings) = sidecar.get("settings").cloned() {
                if !settings.is_null() {
                    obj.insert("settings".into(), settings);
                }
            }
            if let Some(animations) = sidecar.get("animations").cloned() {
                // 旧 project 形状的 animations 是数组；sidecar 里是按 widgetId 的对象。
                // 这里做一次展平：把对象 {id: [a1, a2]} 变为 [{..a1, widgetId: id}, ...]
                if let Some(map) = animations.as_object() {
                    let mut flat: Vec<serde_json::Value> = Vec::new();
                    let mut next_id: i64 = 1;
                    for (widget_id, list) in map.iter() {
                        let wid: i64 = widget_id.parse().unwrap_or(0);
                        if let Some(arr) = list.as_array() {
                            for a in arr {
                                let mut merged = a.clone();
                                if let Some(o) = merged.as_object_mut() {
                                    o.entry("id".to_string())
                                        .or_insert_with(|| json!(next_id));
                                    o.entry("widgetId".to_string())
                                        .or_insert_with(|| json!(wid));
                                }
                                next_id += 1;
                                flat.push(merged);
                            }
                        }
                    }
                    obj.insert("animations".into(), serde_json::Value::Array(flat));
                    obj.insert("nextAnimId".into(), json!(next_id));
                } else if animations.is_array() {
                    obj.insert("animations".into(), animations);
                }
            }
        }

        self.project = serde_json::from_value(base).map_err(|e| e.to_string())?;
        // 注意：不改 project_path——sidecar 只代表 UI 数据，不是 .uiproj 项目文件本身
        Ok(self.get_snapshot())
    }

    // -------- 资源管理（image/clickImage/hoverImage） --------
    //
    // 设计约定：
    //   - 图片资源在工程里用 `ImageResource { label, value, localPath, previewUrl }` 表达；
    //   - widget 侧只存 war3 相对路径（`value`，如 `war3mapImported/icon.blp`），
    //     `localPath` 是磁盘绝对路径（AI 通过 MCP 调用能拿到的那条路径）；
    //   - AI 可先用 `list_resources` 盘点，再 `normalize_resource_paths` 把裸绝对路径登记成资源，
    //     最后 `copy_resources` 把文件落到目标目录（一般是模板仓的 resource/）。

    pub fn list_resources(&self, include_unused: bool) -> serde_json::Value {
        use std::collections::BTreeMap;

        // 收集每个 value 对应的使用方 widgetId
        let mut used_by: BTreeMap<String, Vec<i64>> = BTreeMap::new();
        for w in &self.project.widgets {
            let id = w.get("id").and_then(|x| x.as_i64()).unwrap_or(0);
            for field in ["image", "clickImage", "hoverImage"] {
                if let Some(v) = w.get(field).and_then(|x| x.as_str()) {
                    if v.is_empty() {
                        continue;
                    }
                    used_by.entry(v.to_string()).or_default().push(id);
                }
            }
        }

        // 已登记资源按 value 建索引
        let mut by_value: HashMap<String, &serde_json::Value> = HashMap::new();
        for r in &self.project.resources {
            if let Some(v) = r.get("value").and_then(|x| x.as_str()) {
                by_value.insert(v.to_string(), r);
            }
        }

        let mut all_values: Vec<String> = used_by.keys().cloned().collect();
        if include_unused {
            for v in by_value.keys() {
                if !used_by.contains_key(v) {
                    all_values.push(v.clone());
                }
            }
        }

        let mut out = Vec::with_capacity(all_values.len());
        for value in all_values {
            let registered = by_value.get(&value);
            let label = registered
                .and_then(|r| r.get("label").and_then(|x| x.as_str()))
                .map(|s| s.to_string())
                .unwrap_or_else(|| {
                    Path::new(&value.replace('\\', "/"))
                        .file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_else(|| value.clone())
                });
            let local_path = registered
                .and_then(|r| r.get("localPath").and_then(|x| x.as_str()))
                .map(|s| s.to_string())
                .unwrap_or_default();
            let exists = if local_path.is_empty() {
                false
            } else {
                Path::new(&local_path).is_file()
            };
            let is_absolute = is_absolute_path(&value);
            out.push(json!({
                "value": value,
                "label": label,
                "localPath": local_path,
                "exists": exists,
                "registered": registered.is_some(),
                "isAbsolutePath": is_absolute,
                "usedByWidgetIds": used_by.get(&value).cloned().unwrap_or_default(),
            }));
        }
        json!({ "resources": out })
    }

    pub async fn copy_resources(
        &self,
        target_dir: String,
        values: Option<Vec<String>>,
        overwrite: bool,
    ) -> Result<serde_json::Value, String> {
        let target_root = PathBuf::from(&target_dir);
        fs::create_dir_all(&target_root)
            .await
            .map_err(|e| format!("建立目标目录失败 {}: {}", target_dir, e))?;

        // 如果未显式指定 values，就默认拷贝所有"被 widget 引用的"资源
        let target_values: Vec<String> = match values {
            Some(v) if !v.is_empty() => v,
            _ => {
                let mut set: HashSet<String> = HashSet::new();
                for w in &self.project.widgets {
                    for field in ["image", "clickImage", "hoverImage"] {
                        if let Some(v) = w.get(field).and_then(|x| x.as_str()) {
                            if !v.is_empty() {
                                set.insert(v.to_string());
                            }
                        }
                    }
                }
                set.into_iter().collect()
            }
        };

        let mut copied = Vec::new();
        let mut skipped = Vec::new();
        let mut errors = Vec::new();

        for value in &target_values {
            // 需要找到对应 ImageResource.localPath
            let resource = self
                .project
                .resources
                .iter()
                .find(|r| r.get("value").and_then(|x| x.as_str()) == Some(value.as_str()));
            let Some(resource) = resource else {
                skipped.push(json!({ "value": value, "reason": "not registered" }));
                continue;
            };
            let local_path = resource
                .get("localPath")
                .and_then(|x| x.as_str())
                .unwrap_or("");
            if local_path.is_empty() {
                skipped.push(json!({ "value": value, "reason": "no localPath" }));
                continue;
            }
            if !Path::new(local_path).is_file() {
                errors.push(json!({
                    "value": value,
                    "localPath": local_path,
                    "reason": "source missing"
                }));
                continue;
            }
            // 把 war3 风格的反斜杠归一成正斜杠，再按平台分隔符 join
            let rel_norm = value.replace('\\', "/");
            let rel_parts: Vec<&str> = rel_norm.split('/').filter(|p| !p.is_empty()).collect();
            let mut dest = target_root.clone();
            for p in &rel_parts {
                dest.push(p);
            }
            if let Some(parent) = dest.parent() {
                if let Err(e) = fs::create_dir_all(parent).await {
                    errors.push(json!({
                        "value": value,
                        "reason": format!("mkdir parent failed: {}", e)
                    }));
                    continue;
                }
            }
            if !overwrite && dest.exists() {
                skipped.push(json!({
                    "value": value,
                    "reason": "destination exists and overwrite=false",
                    "destPath": dest.to_string_lossy(),
                }));
                continue;
            }
            match fs::copy(local_path, &dest).await {
                Ok(bytes) => copied.push(json!({
                    "value": value,
                    "fromPath": local_path,
                    "destPath": dest.to_string_lossy(),
                    "bytes": bytes,
                })),
                Err(e) => errors.push(json!({
                    "value": value,
                    "fromPath": local_path,
                    "destPath": dest.to_string_lossy(),
                    "reason": format!("copy failed: {}", e)
                })),
            }
        }

        Ok(json!({
            "targetDir": target_dir,
            "copied": copied,
            "skipped": skipped,
            "errors": errors,
        }))
    }

    pub fn normalize_resource_paths(&mut self, prefix: Option<String>) -> serde_json::Value {
        let prefix = {
            let p = prefix.unwrap_or_else(|| "war3mapImported/".into());
            if p.ends_with('/') { p } else { format!("{}/", p) }
        };

        // 先建立现有资源的 value -> label / localPath 索引（用 value 的反斜杠归一化 key）
        let mut registered: HashMap<String, ()> = HashMap::new();
        for r in &self.project.resources {
            if let Some(v) = r.get("value").and_then(|x| x.as_str()) {
                registered.insert(v.replace('\\', "/"), ());
            }
        }

        let mut added: Vec<serde_json::Value> = Vec::new();
        let mut rewritten: Vec<serde_json::Value> = Vec::new();

        // 用 basename 去重，避免多个 widget 指向同一个 abs 路径时反复登记
        let mut basename_to_war3: HashMap<String, String> = HashMap::new();

        for w in self.project.widgets.iter_mut() {
            let id = w.get("id").and_then(|x| x.as_i64()).unwrap_or(0);
            let wobj = match w.as_object_mut() {
                Some(o) => o,
                None => continue,
            };
            for field in ["image", "clickImage", "hoverImage"] {
                let cur = match wobj.get(field).and_then(|x| x.as_str()) {
                    Some(s) if !s.is_empty() => s.to_string(),
                    _ => continue,
                };
                if !is_absolute_path(&cur) {
                    continue;
                }
                let cur_norm = cur.replace('\\', "/");
                let basename = Path::new(&cur_norm)
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_else(|| cur.clone());
                let war3_value = basename_to_war3
                    .entry(basename.to_ascii_lowercase())
                    .or_insert_with(|| format!("{}{}", prefix, basename))
                    .clone();
                // 登记资源（若还没有）
                let key = war3_value.replace('\\', "/");
                if !registered.contains_key(&key) {
                    let res = json!({
                        "label": basename,
                        "value": war3_value,
                        "localPath": cur,
                        "previewUrl": ""
                    });
                    self.project.resources.push(res.clone());
                    registered.insert(key.clone(), ());
                    added.push(res);
                }
                // 改写 widget 字段
                wobj.insert(field.to_string(), serde_json::Value::String(war3_value.clone()));
                rewritten.push(json!({
                    "widgetId": id,
                    "field": field,
                    "from": cur_norm,
                    "to": war3_value,
                }));
            }
        }

        json!({
            "prefix": prefix,
            "addedResources": added,
            "rewrittenWidgets": rewritten,
        })
    }

    pub fn get_snapshot(&self) -> ProjectSnapshot {
        let diagnostics = self.validate().diagnostics;
        ProjectSnapshot {
            project_path: self
                .project_path
                .as_ref()
                .map(|p| p.to_string_lossy().to_string()),
            project: self.project.clone(),
            diagnostics,
        }
    }

    pub fn apply_actions(
        &mut self,
        actions: &[serde_json::Value],
        options: ApplyOptions,
    ) -> ApplyResult {
        let mut next_id = self
            .project
            .widgets
            .iter()
            .filter_map(|w| w.get("id").and_then(|x| x.as_i64()))
            .max()
            .unwrap_or(0)
            + 1;
        let mut errors = Vec::new();
        let mut warnings = Vec::new();
        let mut applied = 0usize;
        let session_id = options
            .session_id
            .clone()
            .unwrap_or_else(|| format!("session-{}", chrono_timestamp_ms()));
        let dry_run = options.dry_run;
        let working = if dry_run {
            serde_json::from_value::<ProjectData>(
                serde_json::to_value(&self.project).unwrap_or_default(),
            )
            .unwrap_or_else(|_| self.project.clone())
        } else {
            self.project.clone()
        };
        let mut working = working;
        let start = std::time::Instant::now();

        for action in actions {
            let action_type = action.get("type").and_then(|t| t.as_str()).unwrap_or("");
            let action_id = action
                .get("actionId")
                .or_else(|| action.get("idempotencyKey"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
                .unwrap_or_else(|| {
                    format!(
                        "action-{}-{}",
                        chrono_timestamp_ms(),
                        applied + errors.len()
                    )
                });
            let res = (|| -> Result<(), String> {
                if action_type == "clearProject" && !options.allow_dangerous {
                    return Err("dangerous action blocked: clearProject".into());
                }
                if action_type == "createWidget" {
                    let payload = action.get("payload").cloned().unwrap_or(json!({}));
                    let widget_type = payload
                        .get("widgetType")
                        .and_then(|x| x.as_str())
                        .unwrap_or("panel");
                    let id = next_id;
                    next_id += 1;
                    let mut widget = json!({
                        "id": id,
                        "name": format!("{}_{}", widget_type, id),
                        "type": widget_type,
                        "parentId": serde_json::Value::Null,
                        "x": 960,
                        "y": 540,
                        "w": 100,
                        "h": 100,
                        "enable": true,
                        "visible": true,
                        "locked": false,
                        "text": "",
                        "image": ""
                    });
                    if let Some(over) = payload.get("overrides") {
                        shallow_merge(&mut widget, over.clone());
                    }
                    working.widgets.push(widget);
                    self.push_audit(&session_id, &action_id, action_type, dry_run);
                    applied += 1;
                    return Ok(());
                }
                if action_type == "updateWidgetProps" {
                    let target_id = action
                        .get("targetId")
                        .and_then(|x| x.as_i64())
                        .ok_or_else(|| "missing targetId".to_string())?;
                    let target = working
                        .widgets
                        .iter_mut()
                        .find(|w| w.get("id").and_then(|x| x.as_i64()) == Some(target_id))
                        .ok_or_else(|| format!("widget not found: {}", target_id))?;
                    if let Some(p) = action.get("payload").and_then(|x| x.as_object()) {
                        for (k, v) in p {
                            target[k] = v.clone();
                        }
                    }
                    self.push_audit(&session_id, &action_id, action_type, dry_run);
                    applied += 1;
                    return Ok(());
                }
                if action_type == "deleteWidget" {
                    let target_id = action
                        .get("targetId")
                        .and_then(|x| x.as_i64())
                        .ok_or_else(|| "missing targetId".to_string())?;
                    let mut to_delete = HashSet::new();
                    to_delete.insert(target_id);
                    let mut expanded = true;
                    while expanded {
                        expanded = false;
                        for w in &working.widgets {
                            let wid = w.get("id").and_then(|x| x.as_i64()).unwrap_or(0);
                            let parent = w
                                .get("parentId")
                                .and_then(|x| x.as_i64());
                            if let Some(p) = parent {
                                if to_delete.contains(&p) && !to_delete.contains(&wid) {
                                    to_delete.insert(wid);
                                    expanded = true;
                                }
                            }
                        }
                    }
                    if to_delete.len() > 10 && !options.allow_dangerous {
                        return Err("dangerous action blocked: deleteWidget affects more than 10 widgets".into());
                    }
                    working.widgets.retain(|w| {
                        let wid = w.get("id").and_then(|x| x.as_i64()).unwrap_or(0);
                        !to_delete.contains(&wid)
                    });
                    self.push_audit(&session_id, &action_id, action_type, dry_run);
                    applied += 1;
                    return Ok(());
                }
                if action_type == "setParent" {
                    let target_id = action
                        .get("targetId")
                        .and_then(|x| x.as_i64())
                        .ok_or_else(|| "missing targetId".to_string())?;
                    let target = working
                        .widgets
                        .iter_mut()
                        .find(|w| w.get("id").and_then(|x| x.as_i64()) == Some(target_id))
                        .ok_or_else(|| format!("widget not found: {}", target_id))?;
                    let parent_id = action
                        .get("payload")
                        .and_then(|p| p.get("parentId"))
                        .cloned()
                        .unwrap_or(serde_json::Value::Null);
                    target["parentId"] = parent_id;
                    self.push_audit(&session_id, &action_id, action_type, dry_run);
                    applied += 1;
                    return Ok(());
                }
                if action_type == "clearProject" {
                    working.widgets = vec![];
                    working.animations = vec![];
                    self.push_audit(&session_id, &action_id, action_type, dry_run);
                    applied += 1;
                    return Ok(());
                }
                Err(format!("unsupported action type: {}", action_type))
            })();
            if let Err(e) = res {
                errors.push(e);
            }
        }

        if !dry_run {
            self.project = working;
        }
        let elapsed_ms = start.elapsed().as_millis() as u64;
        if dry_run {
            warnings.push("dry-run enabled: project state not persisted".to_string());
        }
        ApplyResult {
            ok: errors.is_empty(),
            applied,
            errors,
            warnings,
            dry_run,
            elapsed_ms,
            session_id,
        }
    }

    fn push_audit(&mut self, session_id: &str, action_id: &str, action_type: &str, dry_run: bool) {
        self.action_audit.push(AuditEvent {
            session_id: session_id.to_string(),
            action_id: action_id.to_string(),
            action_type: action_type.to_string(),
            at: chrono::Utc::now().to_rfc3339(),
            dry_run: Some(dry_run),
        });
    }

    pub fn validate(&self) -> ValidateResult {
        let mut diagnostics = Vec::new();
        let mut by_parent: HashMap<String, HashMap<String, usize>> = HashMap::new();
        for w in &self.project.widgets {
            let parent_key = match w.get("parentId") {
                None | Some(serde_json::Value::Null) => "__root__".to_string(),
                Some(v) => format!("{}", v),
            };
            let name = w
                .get("name")
                .and_then(|x| x.as_str())
                .unwrap_or("")
                .trim()
                .to_string();
            if !name.is_empty() {
                let m = by_parent.entry(parent_key).or_default();
                *m.entry(name).or_insert(0) += 1;
            }
        }
        for m in by_parent.values() {
            for (name, count) in m {
                if *count > 1 {
                    diagnostics.push(format!("duplicate child name: {}", name));
                }
            }
        }
        let mut missing = 0usize;
        for w in &self.project.widgets {
            let img = w.get("image").and_then(|x| x.as_str()).unwrap_or("");
            if img.is_empty() {
                continue;
            }
            let found = self.project.resources.iter().any(|r| {
                r.get("value")
                    .and_then(|x| x.as_str())
                    .map(|v| v == img)
                    .unwrap_or(false)
            });
            if !found {
                missing += 1;
            }
        }
        if missing > 0 {
            diagnostics.push(format!("missing image resources: {}", missing));
        }
        ValidateResult {
            ok: diagnostics.is_empty(),
            diagnostics,
        }
    }

    pub fn export_structured_json(&self) -> String {
        let exported_at = chrono::Utc::now().to_rfc3339();
        let project_name = self
            .project_path
            .as_ref()
            .map(|p| {
                Path::new(p)
                    .file_stem()
                    .map(|s| s.to_string_lossy().to_string())
                    .unwrap_or_else(|| "GeneratedUI".into())
            })
            .unwrap_or_else(|| "GeneratedUI".into());
        let tree = build_widget_tree(&self.project.widgets);
        let payload = json!({
            "meta": {
                "format": "ui-designer-structured-json",
                "version": "1.0.0",
                "exportedAt": exported_at,
                "projectName": project_name
            },
            "settings": {
                "canvasWidth": self.project.settings.get("canvasWidth"),
                "canvasHeight": self.project.settings.get("canvasHeight"),
            },
            "resources": self.project.resources,
            "widgets": {
                "flat": self.project.widgets,
                "tree": tree
            },
            "animations": self.project.animations,
            "diagnostics": self.validate().diagnostics
        });
        serde_json::to_string_pretty(&payload).unwrap_or_else(|_| "{}".into())
    }

    fn export_typescript(&self) -> String {
        let class_name = self
            .project_path
            .as_ref()
            .map(|p| {
                Path::new(p)
                    .file_stem()
                    .map(|s| s.to_string_lossy().to_string())
                    .unwrap_or_else(|| "GeneratedUI".into())
            })
            .unwrap_or_else(|| "GeneratedUI".into());
        let payload = json!({
            "settings": self.project.settings,
            "widgets": self.project.widgets,
            "resources": self.project.resources,
            "animations": self.project.animations,
        });
        let body = serde_json::to_string_pretty(&payload).unwrap_or_else(|_| "{}".into());
        format!(
            "/**\n * Auto-generated by ui-designer MCP.\n */\nexport const {} = {} as const;\n",
            class_name, body
        )
    }

    fn export_lua(&self) -> String {
        let class_name = self
            .project_path
            .as_ref()
            .map(|p| {
                Path::new(p)
                    .file_stem()
                    .map(|s| s.to_string_lossy().to_string())
                    .unwrap_or_else(|| "GeneratedUI".into())
            })
            .unwrap_or_else(|| "GeneratedUI".into());
        let mut lua = String::new();
        lua.push_str("-- Auto-generated by ui-designer MCP\n");
        lua.push_str(&format!("---@class {}:Frame.Panel\n", class_name));
        lua.push_str(&format!("{} = Class('{}', Frame.Panel)\n\n", class_name, class_name));
        lua.push_str(&format!("function {}:ctor()\n", class_name));
        lua.push_str("    Frame.Panel.ctor(self, {\n");
        lua.push_str("        parent = Frame.GameUI,\n");
        lua.push_str("        x = 0,\n");
        lua.push_str("        y = 0,\n");
        lua.push_str("        w = 1920,\n");
        lua.push_str("        h = 1080,\n");
        lua.push_str("        image = Const.Texture.blank,\n");
        lua.push_str("    })\n\n");
        for w in &self.project.widgets {
            let wtype = w.get("type").and_then(|x| x.as_str()).unwrap_or("panel");
            let name = w
                .get("name")
                .and_then(|x| x.as_str())
                .map(|s| s.to_string())
                .unwrap_or_else(|| {
                    format!(
                        "{}_{}",
                        wtype,
                        w.get("id").and_then(|x| x.as_i64()).unwrap_or(0)
                    )
                });
            let x = w.get("x").and_then(|v| v.as_f64()).unwrap_or(0.0).round() as i64;
            let y = w.get("y").and_then(|v| v.as_f64()).unwrap_or(0.0).round() as i64;
            let ww = w.get("w").and_then(|v| v.as_f64()).unwrap_or(100.0).round() as i64;
            let hh = w.get("h").and_then(|v| v.as_f64()).unwrap_or(100.0).round() as i64;
            lua.push_str(&format!(
                "    self.{} = self:createChild('{}', {{\n",
                name, wtype
            ));
            lua.push_str(&format!("        x = {},\n", x));
            lua.push_str(&format!("        y = {},\n", y));
            lua.push_str(&format!("        w = {},\n", ww));
            lua.push_str(&format!("        h = {},\n", hh));
            if let Some(t) = w.get("text").and_then(|x| x.as_str()) {
                if !t.is_empty() {
                    lua.push_str(&format!("        text = [[{}]],\n", escape_lua_text(t)));
                }
            }
            if let Some(im) = w.get("image").and_then(|x| x.as_str()) {
                if !im.is_empty() {
                    lua.push_str(&format!("        image = [[{}]],\n", escape_lua_text(im)));
                }
            }
            lua.push_str("    })\n");
        }
        lua.push_str("end\n");
        lua
    }

    pub async fn export_code(
        &self,
        output_path: &str,
        plugin_id: Option<&str>,
    ) -> Result<serde_json::Value, String> {
        let pid = plugin_id.unwrap_or("json-structured-export");
        let output = if pid == "lua-export" || pid == "lua" {
            self.export_lua()
        } else if pid == "typescript-export" || pid == "typescript" || pid == "ts" {
            self.export_typescript()
        } else {
            self.export_structured_json()
        };
        fs::write(output_path, output)
            .await
            .map_err(|e| e.to_string())?;
        Ok(json!({
            "outputFiles": [output_path],
            "pluginId": pid,
            "elapsedMs": 0,
            "warnings": []
        }))
    }

    pub fn get_audit_trail(&self, limit: usize) -> Vec<AuditEvent> {
        let n = self.action_audit.len();
        let start = n.saturating_sub(limit);
        self.action_audit[start..].to_vec()
    }

    pub fn append_transaction_event(&mut self, event: TransactionAuditEvent) {
        let mut e = event;
        if e.at.is_none() {
            e.at = Some(chrono::Utc::now().to_rfc3339());
        }
        self.transaction_audit.push(e);
    }

    pub fn get_transaction_audit_trail(&self, limit: usize) -> Vec<TransactionAuditEvent> {
        let n = self.transaction_audit.len();
        let start = n.saturating_sub(limit);
        self.transaction_audit[start..].to_vec()
    }
}

pub struct ApplyOptions {
    pub dry_run: bool,
    pub session_id: Option<String>,
    pub allow_dangerous: bool,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct ApplyResult {
    pub ok: bool,
    pub applied: usize,
    pub errors: Vec<String>,
    pub warnings: Vec<String>,
    pub dry_run: bool,
    pub elapsed_ms: u64,
    pub session_id: String,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct ValidateResult {
    pub ok: bool,
    pub diagnostics: Vec<String>,
}

fn shallow_merge(base: &mut serde_json::Value, patch: serde_json::Value) {
    let serde_json::Value::Object(a) = base else {
        return;
    };
    let serde_json::Value::Object(b) = patch else {
        return;
    };
    for (k, v) in b {
        a.insert(k, v);
    }
}

fn build_widget_tree(widgets: &[serde_json::Value]) -> Vec<serde_json::Value> {
    let mut node_map: HashMap<i64, serde_json::Value> = HashMap::new();
    for w in widgets {
        let id = w.get("id").and_then(|x| x.as_i64()).unwrap_or(0);
        let mut n = w.clone();
        if let Some(o) = n.as_object_mut() {
            o.insert("children".into(), json!([]));
        }
        node_map.insert(id, n);
    }
    for w in widgets {
        let id = w.get("id").and_then(|x| x.as_i64()).unwrap_or(0);
        let pid = w.get("parentId");
        if pid.is_none() || pid == Some(&serde_json::Value::Null) {
            continue;
        }
        let Some(parent_id) = pid.and_then(|x| x.as_i64()) else {
            continue;
        };
        let child = match node_map.get(&id) {
            Some(c) => c.clone(),
            None => continue,
        };
        if let Some(parent) = node_map.get_mut(&parent_id) {
            if let Some(arr) = parent.get_mut("children").and_then(|c| c.as_array_mut()) {
                arr.push(child);
            }
        }
    }
    let mut roots = Vec::new();
    for w in widgets {
        let id = w.get("id").and_then(|x| x.as_i64()).unwrap_or(0);
        let pid = w.get("parentId");
        if pid.is_none() || pid == Some(&serde_json::Value::Null) {
            if let Some(n) = node_map.get(&id) {
                roots.push(n.clone());
            }
        }
    }
    roots
}

/// 判断字符串是否是"裸绝对路径"。跨平台放宽：
///   - Windows 盘符：`C:\foo` / `C:/foo`
///   - UNC：`\\server\share`
///   - POSIX：`/usr/...`
pub fn is_absolute_path(s: &str) -> bool {
    if s.is_empty() {
        return false;
    }
    let bytes = s.as_bytes();
    if s.starts_with("\\\\") || s.starts_with("//") {
        return true;
    }
    if bytes.len() >= 3
        && (bytes[0].is_ascii_alphabetic())
        && bytes[1] == b':'
        && (bytes[2] == b'\\' || bytes[2] == b'/')
    {
        return true;
    }
    if bytes[0] == b'/' {
        // POSIX 绝对。注意不要把 `war3mapImported/xxx` 误判：它不以 `/` 开头。
        return true;
    }
    false
}

fn escape_lua_text(text: &str) -> String {
    text.replace("]]", "] ]")
}

fn chrono_timestamp_ms() -> u128 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn smoke_apply_validate_audit_export() {
        let mut engine = ProjectEngine::new();
        let apply = engine.apply_actions(
            &[json!({
                "type": "createWidget",
                "actionId": "e2e-main-button",
                "payload": {
                    "widgetType": "button",
                    "overrides": { "name": "btnStart", "text": "开始游戏", "x": 300, "y": 200 }
                }
            })],
            ApplyOptions {
                dry_run: false,
                session_id: Some("e2e-session-1".into()),
                allow_dangerous: false,
            },
        );
        assert!(apply.ok, "{:?}", apply.errors);
        let validate = engine.validate();
        assert!(validate.ok, "{:?}", validate.diagnostics);
        let audit = engine.get_audit_trail(20);
        assert!(!audit.is_empty());

        let tmp = std::env::temp_dir().join(format!(
            "ui-designer-export-{}.json",
            std::process::id()
        ));
        let out = engine
            .export_code(tmp.to_str().unwrap(), Some("json-structured-export"))
            .await;
        assert!(out.is_ok(), "{:?}", out);
        let _ = std::fs::remove_file(&tmp);
    }
}
