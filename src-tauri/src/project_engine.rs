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

/// 项目文件内存态——对齐 schema 2.0.0：
/// - 没有 `resources` 登记表，图片仅通过 widget.image(abs) 直接引用全局库下的文件。
/// - 内存里 widget.image 保持**绝对磁盘路径**；save 落盘时由 frontend 统一转成相对路径。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectData {
    #[serde(default = "default_schema_version")]
    pub schema_version: String,
    pub widgets: Vec<serde_json::Value>,
    pub settings: serde_json::Value,
    pub animations: Vec<serde_json::Value>,
    pub next_anim_id: i64,
    pub export_config: serde_json::Value,
}

pub const PROJECT_SCHEMA_VERSION: &str = "2.0.0";

fn default_schema_version() -> String { PROJECT_SCHEMA_VERSION.to_string() }

fn default_project() -> ProjectData {
    serde_json::from_value(json!({
        "schemaVersion": PROJECT_SCHEMA_VERSION,
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
            .map_err(|e| format!("读取项目文件失败 {}: {}", project_path, e))?;
        let parsed: serde_json::Value =
            serde_json::from_str(&raw).map_err(|e| e.to_string())?;
        // schema 2.0.0 起强制校验版本——和 frontend useProjectFile 的 MIN_SUPPORTED_SCHEMA 保持一致
        let schema = parsed.get("schemaVersion").and_then(|x| x.as_str()).unwrap_or("");
        if !version_gte(schema, PROJECT_SCHEMA_VERSION) {
            return Err(format!(
                "项目 schema 版本 {:?} 低于 {}，不再兼容旧格式。请用 ui-designer 重新保存。",
                schema, PROJECT_SCHEMA_VERSION
            ));
        }
        let mut base = serde_json::to_value(default_project()).map_err(|e| e.to_string())?;
        shallow_merge(&mut base, parsed);
        // 旧 schema 残留的 resources 字段已不再是合法顶级字段——忽略掉避免反序列化失败
        if let Some(obj) = base.as_object_mut() {
            obj.remove("resources");
        }
        self.project = serde_json::from_value(base).map_err(|e| e.to_string())?;
        self.project.schema_version = PROJECT_SCHEMA_VERSION.to_string();
        self.project_path = Some(PathBuf::from(project_path));
        Ok(self.get_snapshot())
    }

    

    pub async fn save_project(&mut self, project_path: Option<String>) -> Result<serde_json::Value, String> {
        let path = project_path
            .or_else(|| self.project_path.as_ref().map(|p| p.to_string_lossy().to_string()))
            .ok_or_else(|| "projectPath is required".to_string())?;

        // 允许传入尚不存在的目录路径：先创建父目录，避免 Windows 下 os error 3。
        if let Some(parent) = Path::new(&path).parent() {
            if !parent.as_os_str().is_empty() {
                fs::create_dir_all(parent)
                    .await
                    .map_err(|e| format!("创建项目目录失败 {}: {}", parent.display(), e))?;
            }
        }

        let data = serde_json::to_string_pretty(&self.project).map_err(|e| e.to_string())?;
        fs::write(&path, data)
            .await
            .map_err(|e| format!("写入项目文件失败 {}: {}", path, e))?;
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
            .map_err(|e| format!("读取 sidecar 失败 {}: {}", sidecar_path, e))?;
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
    // schema 2.0.0 约定：
    //   - 项目不再维护资源登记表；widget.image（以及 clickImage/hoverImage）是对
    //     **全局资源库里某个文件的绝对磁盘路径引用**。
    //   - `list_resources` 直接扫 widgets 生成视图。
    //   - `normalize_resource_paths` 把"裸绝对路径"指向的文件拷进全局库，
    //     并把 widget 字段改写成"**全局库内**的绝对路径"。
    //   - `copy_resources` 把 widget 引用到的文件拷到目标目录（模板仓 `resource/`），
    //     目的地路径保留相对全局库根的子目录层级。
    //   - `_include_unused` 为 false 时结果仅包含"被至少一个 widget 引用的值"；为 true
    //     时也会把"全局库里存在但项目没引用"的值列出来——当前无独立登记表，等价于
    //     "库里的所有条目"，由前端通过 `global_resource_root` 解析，MCP 侧暂不扩展。

    pub fn list_resources(&self, _include_unused: bool) -> serde_json::Value {
        use std::collections::BTreeMap;

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

        let mut out = Vec::with_capacity(used_by.len());
        for (value, widgets) in used_by {
            let is_absolute = is_absolute_path(&value);
            let local_path = if is_absolute { value.clone() } else { String::new() };
            let exists = if local_path.is_empty() { false } else { Path::new(&local_path).is_file() };
            let label = Path::new(&value.replace('\\', "/"))
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| value.clone());
            out.push(json!({
                "value": value,
                "label": label,
                "localPath": local_path,
                "exists": exists,
                "isAbsolutePath": is_absolute,
                "usedByWidgetIds": widgets,
            }));
        }
        json!({ "resources": out })
    }

    /// 把项目里被引用的图片从 widget 自身的绝对路径拷到 target_dir。
    ///
    /// schema 2.0.0：
    /// - 不再依赖 `project.resources` 登记表——widget 的绝对路径本身就是"源"。
    /// - `values`：可选，一组 widget 引用值。空或缺省时默认拷贝所有被 widget 引用到的值。
    /// - `global_resource_root`：用来把 abs 还原成库内 relPath，决定目标子目录层级。
    ///   没提供时退化为直接用 basename 作为目标子路径。
    /// - 非绝对路径的值（例如 `war3mapImported\icon.blp`）会进入 `skipped`，除非它们恰好
    ///   可以在 `global_resource_root` 下解析到真实文件——这种情况主要留给老项目兜底。
    pub async fn copy_resources(
        &self,
        target_dir: String,
        values: Option<Vec<String>>,
        overwrite: bool,
        global_resource_root: Option<String>,
    ) -> Result<serde_json::Value, String> {
        let target_root = PathBuf::from(&target_dir);
        fs::create_dir_all(&target_root)
            .await
            .map_err(|e| format!("建立目标目录失败 {}: {}", target_dir, e))?;

        let global_root: Option<PathBuf> = global_resource_root
            .as_ref()
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .map(PathBuf::from);

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
            // 解析出 (源绝对路径, 相对全局库的子路径)
            let (src_abs, rel_in_lib): (String, String) = if is_absolute_path(value) {
                let abs_buf = PathBuf::from(value);
                let rel = match &global_root {
                    Some(root) => abs_buf
                        .strip_prefix(root)
                        .ok()
                        .map(|p| p.to_string_lossy().to_string())
                        .unwrap_or_else(|| {
                            abs_buf
                                .file_name()
                                .map(|n| n.to_string_lossy().to_string())
                                .unwrap_or_else(|| value.clone())
                        }),
                    None => abs_buf
                        .file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_else(|| value.clone()),
                };
                (value.clone(), rel)
            } else {
                // 兜底：老项目的 `war3mapImported\...`，只有在有 global_root 时才能解析源文件
                let war3_rel = value.trim_start_matches(|c| c == '\\' || c == '/').to_string();
                let stripped = war3_rel
                    .strip_prefix("war3mapImported/")
                    .or_else(|| war3_rel.strip_prefix("war3mapImported\\"))
                    .unwrap_or(&war3_rel)
                    .to_string();
                match &global_root {
                    Some(root) => {
                        let abs_buf = root.join(stripped.replace('\\', std::path::MAIN_SEPARATOR_STR.chars().next().unwrap_or('/').to_string().as_str()));
                        if !abs_buf.is_file() {
                            skipped.push(json!({
                                "value": value,
                                "reason": "not absolute and not found under global_resource_root",
                                "tried": abs_buf.to_string_lossy(),
                            }));
                            continue;
                        }
                        (abs_buf.to_string_lossy().to_string(), stripped)
                    }
                    None => {
                        skipped.push(json!({
                            "value": value,
                            "reason": "not absolute; pass global_resource_root to resolve"
                        }));
                        continue;
                    }
                }
            };

            if !Path::new(&src_abs).is_file() {
                errors.push(json!({
                    "value": value,
                    "localPath": src_abs,
                    "reason": "source missing"
                }));
                continue;
            }

            let rel_norm = rel_in_lib.replace('\\', "/");
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
            match fs::copy(&src_abs, &dest).await {
                Ok(bytes) => copied.push(json!({
                    "value": value,
                    "fromPath": src_abs,
                    "destPath": dest.to_string_lossy(),
                    "bytes": bytes,
                })),
                Err(e) => errors.push(json!({
                    "value": value,
                    "fromPath": src_abs,
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

    /// 把 widget 里"裸绝对路径"指向的文件拷进全局资源库，并把 widget 字段改写成
    /// **全局库内的绝对路径**（保持 schema 2.0.0：运行时 widget.image = 绝对磁盘路径）。
    ///
    /// - **`global_root` 必填**：没有全局库就没有新模型。缺失 → `{ ok: false, diagnostics: [...] }`。
    /// - 源路径若已经落在 `global_root` 下，不拷贝，仅规范化分隔符。
    /// - 源路径在别处：按 `<global_root>/<basename>` 拷贝（文件已存在且大小相同时跳过）。
    /// - 非绝对路径（如 `war3mapImported\foo.blp`）不处理，留给上层 / 前端。
    ///
    /// 参数（向后兼容 `prefix`，2.0.0 起不再使用）：
    /// - `prefix`：保留入参以免破坏调用方签名；不影响输出。
    /// - `global_root`：来自前端 `settings.globalResourceRootPath`；建议显式传。
    pub fn normalize_resource_paths(
        &mut self,
        _prefix: Option<String>,
        global_root: Option<String>,
    ) -> serde_json::Value {
        let mut needs_global_root = false;
        for w in self.project.widgets.iter() {
            for field in ["image", "clickImage", "hoverImage"] {
                if let Some(s) = w.get(field).and_then(|x| x.as_str()) {
                    if !s.is_empty() && is_absolute_path(s) {
                        needs_global_root = true;
                        break;
                    }
                }
            }
            if needs_global_root { break; }
        }

        let global_root_path: Option<PathBuf> = global_root
            .as_ref()
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .map(PathBuf::from);

        if needs_global_root && global_root_path.is_none() {
            return json!({
                "ok": false,
                "copied": [],
                "rewrittenWidgets": [],
                "diagnostics": [
                    "widget 里存在裸绝对路径，但没有提供 globalResourceRoot；请让用户在设计器 Settings 里配好全局资源库，或在本次 MCP 调用里显式传 global_resource_root。"
                ],
            });
        }

        let mut copied: Vec<serde_json::Value> = Vec::new();
        let mut rewritten: Vec<serde_json::Value> = Vec::new();
        let mut errors: Vec<serde_json::Value> = Vec::new();

        // basename 去重——多个 widget 指向同一 abs 时只拷贝一次
        let mut basename_to_dest: HashMap<String, PathBuf> = HashMap::new();

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
                let cur_buf = PathBuf::from(&cur);

                // 已经在 global_root 下了，只归一化字符串，不拷贝
                let already_in_root = match &global_root_path {
                    Some(root) => cur_buf.starts_with(root),
                    None => false,
                };

                let dest_path: PathBuf = if already_in_root {
                    cur_buf.clone()
                } else {
                    let root = global_root_path.as_ref().expect("checked above");
                    let basename = cur_buf
                        .file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_else(|| cur.clone());
                    let dest = basename_to_dest
                        .entry(basename.to_ascii_lowercase())
                        .or_insert_with(|| root.join(&basename))
                        .clone();
                    if !dest.exists() {
                        if let Some(parent) = dest.parent() {
                            let _ = std::fs::create_dir_all(parent);
                        }
                        match std::fs::copy(&cur, &dest) {
                            Ok(_) => copied.push(json!({
                                "widgetId": id,
                                "field": field,
                                "src": cur.clone(),
                                "dst": dest.to_string_lossy(),
                            })),
                            Err(e) => {
                                errors.push(json!({
                                    "widgetId": id,
                                    "field": field,
                                    "src": cur.clone(),
                                    "dst": dest.to_string_lossy(),
                                    "message": format!("拷贝到全局库失败: {e}"),
                                }));
                                continue;
                            }
                        }
                    }
                    dest
                };

                let new_value = dest_path.to_string_lossy().to_string();
                if new_value != cur {
                    wobj.insert(field.to_string(), serde_json::Value::String(new_value.clone()));
                    rewritten.push(json!({
                        "widgetId": id,
                        "field": field,
                        "from": cur,
                        "to": new_value,
                    }));
                }
            }
        }

        json!({
            "ok": errors.is_empty(),
            "copied": copied,
            "rewrittenWidgets": rewritten,
            "diagnostics": errors,
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
                        .unwrap_or("panel")
                        .to_string();
                    let overrides = payload
                        .get("overrides")
                        .cloned()
                        .unwrap_or(json!({}));
                    let created = build_composite_widgets(
                        &widget_type,
                        &overrides,
                        &mut next_id,
                    );
                    for w in created {
                        working.widgets.push(w);
                    }
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
        // schema 2.0.0：widget.image 是"绝对路径引用"，不再有独立登记表需要比对。
        // 只检查"image 是绝对路径但文件缺失"的情况，方便 AI 及早发现漂移。
        let mut missing: Vec<String> = Vec::new();
        for w in &self.project.widgets {
            for field in ["image", "clickImage", "hoverImage"] {
                let v = w.get(field).and_then(|x| x.as_str()).unwrap_or("");
                if v.is_empty() || !is_absolute_path(v) { continue; }
                if !Path::new(v).is_file() {
                    missing.push(v.to_string());
                }
            }
        }
        if !missing.is_empty() {
            let preview: Vec<&str> = missing.iter().take(3).map(|s| s.as_str()).collect();
            diagnostics.push(format!(
                "missing image files: {} (e.g. {})",
                missing.len(),
                preview.join(", ")
            ));
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

        // 导出目标目录可能不存在，先创建父目录，避免 os error 3。
        if let Some(parent) = Path::new(output_path).parent() {
            if !parent.as_os_str().is_empty() {
                fs::create_dir_all(parent)
                    .await
                    .map_err(|e| format!("创建导出目录失败 {}: {}", parent.display(), e))?;
            }
        }

        fs::write(output_path, output)
            .await
            .map_err(|e| format!("写入导出文件失败 {}: {}", output_path, e))?;
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

/// 构造一条默认 widget（与前端 `useWidgets.buildWidget` 的语义对齐）。
/// 不处理 `overrides` 合并，调用方负责。
fn make_default_widget(
    widget_type: &str,
    id: i64,
    parent_id: Option<i64>,
) -> serde_json::Value {
    let default_text = match widget_type {
        "text" => "文本",
        "button" => "按钮",
        _ => "",
    };
    let parent_val = match parent_id {
        Some(p) => json!(p),
        None => serde_json::Value::Null,
    };
    json!({
        "id": id,
        "name": format!("{}_{}", widget_type, id),
        "type": widget_type,
        "parentId": parent_val,
        "x": 960,
        "y": 540,
        "w": 100,
        "h": 100,
        "enable": true,
        "visible": true,
        "locked": false,
        "font": "",
        "fontSize": 14,
        "outlineSize": 0,
        "textAlignH": "left",
        "textAlignV": "top",
        "text": default_text,
        "image": "",
        "clickImage": "",
        "hoverImage": "",
        "draggable": false,
        "checked": false,
        "selectedIndex": 0,
    })
}

fn get_i64(v: &serde_json::Value, k: &str, default: i64) -> i64 {
    v.get(k).and_then(|x| x.as_i64()).unwrap_or(default)
}

fn get_str<'a>(v: &'a serde_json::Value, k: &str) -> Option<&'a str> {
    v.get(k).and_then(|x| x.as_str())
}

/// 按照 `widgetType` 生成一条或一组 widgets（组合控件时带上子节点），
/// 与前端 [`useWidgets.addWidget`](src/composables/useWidgets.ts) 行为完全一致：
/// - `button` 追加一个 `type='text'` 的居中 label 子节点
/// - `dialog` 展开成 `panel + title(text) + 两个 button + 两个 label`
/// - 其他 type 只返回单个 widget
///
/// `next_id` 是进出参数（按引用自增），保证批量调用时 id 不冲突。
fn build_composite_widgets(
    widget_type: &str,
    overrides: &serde_json::Value,
    next_id: &mut i64,
) -> Vec<serde_json::Value> {
    match widget_type {
        "dialog" => build_dialog_tree(overrides, next_id),
        "button" => build_button_tree(overrides, next_id),
        _ => {
            let id = *next_id;
            *next_id += 1;
            let mut w = make_default_widget(widget_type, id, None);
            shallow_merge(&mut w, overrides.clone());
            // 强制保留 id 不被 overrides 覆盖（冲突隐患）
            if let Some(o) = w.as_object_mut() {
                o.insert("id".into(), json!(id));
            }
            vec![w]
        }
    }
}

fn build_button_tree(
    overrides: &serde_json::Value,
    next_id: &mut i64,
) -> Vec<serde_json::Value> {
    let btn_id = *next_id;
    *next_id += 1;
    let label_id = *next_id;
    *next_id += 1;

    let mut btn = make_default_widget("button", btn_id, None);
    shallow_merge(&mut btn, overrides.clone());
    if let Some(o) = btn.as_object_mut() {
        o.insert("id".into(), json!(btn_id));
        o.insert("type".into(), json!("button"));
        // parentId 允许通过 overrides 设定外层 parent，否则保持 null
    }

    let bx = get_i64(&btn, "x", 960);
    let by = get_i64(&btn, "y", 540);
    let bw = get_i64(&btn, "w", 100);
    let bh = get_i64(&btn, "h", 100);
    let btn_name = get_str(&btn, "name").unwrap_or("button").to_string();
    let btn_text = get_str(&btn, "text").unwrap_or("按钮").to_string();

    let mut label = make_default_widget("text", label_id, Some(btn_id));
    if let Some(o) = label.as_object_mut() {
        o.insert("x".into(), json!(bx));
        o.insert("y".into(), json!(by));
        o.insert("w".into(), json!(bw));
        o.insert("h".into(), json!(bh));
        o.insert("text".into(), json!(btn_text));
        o.insert("textAlignH".into(), json!("center"));
        o.insert("textAlignV".into(), json!("middle"));
        o.insert("fontSize".into(), json!(14));
        o.insert("textColor".into(), json!("FFFFFF"));
        o.insert("name".into(), json!(format!("{}_label", btn_name)));
    }

    vec![btn, label]
}

fn build_dialog_tree(
    overrides: &serde_json::Value,
    next_id: &mut i64,
) -> Vec<serde_json::Value> {
    let panel_id = *next_id;
    *next_id += 1;

    let mut panel = make_default_widget("panel", panel_id, None);
    if let Some(o) = panel.as_object_mut() {
        // Dialog 默认样式
        o.insert("w".into(), json!(320));
        o.insert("h".into(), json!(220));
        o.insert("templateKind".into(), json!("Dialog"));
        o.insert("showTitleBar".into(), json!(true));
        o.insert("titleBarHeight".into(), json!(28));
        o.insert("title".into(), json!("对话框"));
        o.insert("titleColor".into(), json!("FFCC00"));
        o.insert("showCloseButton".into(), json!(true));
        o.insert("backgroundPreset".into(), json!("DIALOG"));
    }
    shallow_merge(&mut panel, overrides.clone());
    if let Some(o) = panel.as_object_mut() {
        o.insert("id".into(), json!(panel_id));
        o.insert("type".into(), json!("panel"));
    }

    let panel_x = get_i64(&panel, "x", 960);
    let panel_y = get_i64(&panel, "y", 540);
    let panel_w = get_i64(&panel, "w", 320);
    let panel_h = get_i64(&panel, "h", 220);
    let panel_title = get_str(&panel, "title").unwrap_or("对话框").to_string();
    let panel_name = get_str(&panel, "name").unwrap_or("panel").to_string();

    // 标题 Text
    let title_id = *next_id;
    *next_id += 1;
    let mut title = make_default_widget("text", title_id, Some(panel_id));
    if let Some(o) = title.as_object_mut() {
        o.insert("x".into(), json!(panel_x + 12));
        o.insert("y".into(), json!(panel_y + 6));
        o.insert("w".into(), json!(panel_w - 24));
        o.insert("h".into(), json!(20));
        o.insert("text".into(), json!(panel_title));
        o.insert("textAlignH".into(), json!("center"));
        o.insert("textAlignV".into(), json!("middle"));
        o.insert("fontSize".into(), json!(16));
        o.insert("textColor".into(), json!("FFCC00"));
        o.insert("name".into(), json!(format!("{}_title", panel_name)));
    }

    // 两个按钮（确定 / 取消），每个按钮带一个 label 子节点
    let btn_w: i64 = 88;
    let btn_h: i64 = 28;
    let gap: i64 = 16;
    let total_w = btn_w * 2 + gap;
    let start_x = panel_x + (panel_w - total_w) / 2;
    let btn_y = panel_y + panel_h - btn_h - 16;

    let mut result = vec![panel, title];

    for (i, text) in ["确定", "取消"].iter().enumerate() {
        let idx = i as i64;
        let btn_id = *next_id;
        *next_id += 1;
        let label_id = *next_id;
        *next_id += 1;

        let mut btn = make_default_widget("button", btn_id, Some(panel_id));
        if let Some(o) = btn.as_object_mut() {
            o.insert("x".into(), json!(start_x + idx * (btn_w + gap)));
            o.insert("y".into(), json!(btn_y));
            o.insert("w".into(), json!(btn_w));
            o.insert("h".into(), json!(btn_h));
            o.insert("text".into(), json!(*text));
            o.insert("fdfTemplate".into(), json!("NORMAL_DIALOG"));
            o.insert("name".into(), json!(format!("{}_btn_{}", panel_name, idx + 1)));
        }

        let bx = get_i64(&btn, "x", 0);
        let by = get_i64(&btn, "y", 0);
        let bw = get_i64(&btn, "w", btn_w);
        let bh = get_i64(&btn, "h", btn_h);
        let btn_name = get_str(&btn, "name").unwrap_or("button").to_string();

        let mut label = make_default_widget("text", label_id, Some(btn_id));
        if let Some(o) = label.as_object_mut() {
            o.insert("x".into(), json!(bx));
            o.insert("y".into(), json!(by));
            o.insert("w".into(), json!(bw));
            o.insert("h".into(), json!(bh));
            o.insert("text".into(), json!(*text));
            o.insert("textAlignH".into(), json!("center"));
            o.insert("textAlignV".into(), json!("middle"));
            o.insert("fontSize".into(), json!(14));
            o.insert("textColor".into(), json!("FFFFFF"));
            o.insert("name".into(), json!(format!("{}_label", btn_name)));
        }

        result.push(btn);
        result.push(label);
    }

    result
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

/// `a >= b` 语义化版本比较（逐段数字比较；非数字段按 0 处理；段数不足也按 0 补足）。
fn version_gte(a: &str, b: &str) -> bool {
    let parse = |s: &str| -> Vec<u64> {
        s.split('.').map(|p| p.parse::<u64>().unwrap_or(0)).collect()
    };
    let av = parse(a);
    let bv = parse(b);
    let n = av.len().max(bv.len());
    for i in 0..n {
        let x = av.get(i).copied().unwrap_or(0);
        let y = bv.get(i).copied().unwrap_or(0);
        if x != y { return x > y; }
    }
    true
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
