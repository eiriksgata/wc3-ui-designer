//! 基于官方 `rmcp` 的 MCP Streamable HTTP（8765）与运行态桥接（事件，无文件队列）。

use std::sync::{Arc, OnceLock};
use std::time::Duration;

use axum::{Json as AxumJson, Router, response::IntoResponse, routing::get};
use dashmap::DashMap;
use rmcp::{
    ErrorData as McpError,
    handler::server::router::tool::ToolRouter,
    handler::server::wrapper::{Json, Parameters},
    serde::Deserialize,
    tool, tool_router,
    transport::streamable_http_server::{
        StreamableHttpServerConfig, StreamableHttpService, session::local::LocalSessionManager,
    },
};
use schemars::{JsonSchema, Schema, SchemaGenerator};
use serde_json::json;
use tauri::{AppHandle, Manager};
use tokio::sync::{Mutex, oneshot};
use tokio_util::sync::CancellationToken;

use crate::project_engine::{
    ApplyOptions, ProjectEngine, TransactionAuditEvent,
};

fn protocol_meta() -> &'static serde_json::Value {
    static PROTOCOL: OnceLock<serde_json::Value> = OnceLock::new();
    PROTOCOL.get_or_init(|| {
        json!({
            "mode": "rust-mcp",
            "mcpProtocolVersion": "1.0.0",
            "pluginSchemaVersion": "1.0.0"
        })
    })
}

/// MCP 工具统一返回体；根类型须为 object（rmcp）。`serde_json::Value` 默认 schema 会被 Cursor 判为非法，故对 `data`/`protocol` 用手写宽松 object schema。
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, JsonSchema)]
pub struct UiDesignerEnvelope {
    pub ok: bool,
    #[schemars(schema_with = "schema_loose_object")]
    pub data: serde_json::Value,
    pub diagnostics: Vec<String>,
    #[schemars(schema_with = "schema_loose_object")]
    pub protocol: serde_json::Value,
}

fn schema_loose_object(_gen: &mut SchemaGenerator) -> Schema {
    schemars::json_schema!({
        "type": "object",
        "additionalProperties": true
    })
}

fn ok_envelope(data: serde_json::Value, diagnostics: Vec<String>) -> UiDesignerEnvelope {
    UiDesignerEnvelope {
        ok: diagnostics.is_empty(),
        data,
        diagnostics,
        protocol: protocol_meta().clone(),
    }
}

/// 通过 Tauri 事件把运行态请求交给前端，不再使用文件队列。
pub struct RuntimeBridge {
    pending: DashMap<String, oneshot::Sender<serde_json::Value>>,
    app: AppHandle,
}

impl RuntimeBridge {
    pub fn new(app: AppHandle) -> Self {
        Self {
            pending: DashMap::new(),
            app,
        }
    }

    pub fn complete(&self, request_id: &str, result: serde_json::Value) {
        if let Some((_, tx)) = self.pending.remove(request_id) {
            let _ = tx.send(result);
        } else {
            log::warn!(
                "[ui-designer] MCP 运行态 bridge_reply 无匹配的 requestId（可能已超时或重复）: {}",
                request_id
            );
        }
    }

    pub async fn dispatch(
        &self,
        method: &str,
        params: serde_json::Value,
        timeout_ms: u64,
    ) -> Result<serde_json::Value, String> {
        let request_id = uuid::Uuid::new_v4().to_string();
        let (tx, rx) = oneshot::channel();
        self.pending.insert(request_id.clone(), tx);
        let payload = json!({
            "requestId": request_id,
            "method": method,
            "params": params
        });
        log::info!(
            "[ui-designer] MCP 运行态 dispatch requestId={} method={}",
            request_id,
            method
        );
        // 不用 Tauri 事件：`emit`/`listen` 在部分环境下无法闭环。改为在主线程对主 Webview 执行 `eval`，
        // 调用前端全局 `window.__uiDesignerMcpRuntimeDispatch(payload)`（与 useMcpRuntimeBridge 注册一致）。
        let payload_json = serde_json::to_string(&payload).map_err(|e| e.to_string())?;
        let main_label = std::env::var("UI_DESIGNER_WEBVIEW_LABEL").unwrap_or_else(|_| "main".to_string());
        let (emit_done_tx, emit_done_rx) = oneshot::channel::<Result<(), String>>();
        let app = self.app.clone();
        if let Err(e) = self.app.clone().run_on_main_thread(move || {
            let r = (|| -> Result<(), String> {
                let script = format!(
                    "(function(){{var p={}; if(typeof window.__uiDesignerMcpRuntimeDispatch==='function'){{ void window.__uiDesignerMcpRuntimeDispatch(p); }} else {{ console.error('[ui-designer] MCP 运行态未注册 __uiDesignerMcpRuntimeDispatch'); }}}})();",
                    payload_json
                );
                let win = app.get_webview_window(&main_label).ok_or_else(|| {
                    format!("未找到 WebviewWindow label={}", main_label)
                })?;
                win.eval(&script).map_err(|e| e.to_string())?;
                Ok(())
            })();
            if let Err(ref err) = r {
                log::error!("[ui-designer] MCP 主线程 eval 桥接失败: {}", err);
            }
            let _ = emit_done_tx.send(r);
        }) {
            let _ = self.pending.remove(&request_id);
            return Err(e.to_string());
        }
        match emit_done_rx.await {
            Ok(Ok(())) => {
                log::debug!(
                    "[ui-designer] MCP 运行态 eval 桥接已调度 requestId={}",
                    request_id
                );
            }
            Ok(Err(e)) => {
                let _ = self.pending.remove(&request_id);
                return Err(e);
            }
            Err(_) => {
                let _ = self.pending.remove(&request_id);
                return Err("emit 主线程完成通道已关闭".to_string());
            }
        }
        tokio::time::timeout(Duration::from_millis(timeout_ms), rx)
            .await
            .map_err(|_| {
                log::warn!(
                    "[ui-designer] MCP 运行态 bridge 超时 {}ms requestId={} method={}",
                    timeout_ms,
                    request_id,
                    method
                );
                let _ = self.pending.remove(&request_id);
                "runtime bridge timeout".to_string()
            })?
            .map_err(|_| {
                log::warn!(
                    "[ui-designer] MCP 运行态 bridge 通道已关闭 requestId={} method={}",
                    request_id,
                    method
                );
                "runtime bridge channel closed".to_string()
            })
    }
}

#[derive(Clone)]
pub struct UiDesignerMcp {
    #[allow(dead_code)]
    tool_router: ToolRouter<Self>,
    engine: Arc<Mutex<ProjectEngine>>,
    runtime: Arc<RuntimeBridge>,
}

impl UiDesignerMcp {
    pub fn new(engine: Arc<Mutex<ProjectEngine>>, runtime: Arc<RuntimeBridge>) -> Self {
        Self {
            tool_router: Self::tool_router(),
            engine,
            runtime,
        }
    }
}

#[derive(Debug, Deserialize, JsonSchema)]
struct UiOpenProjectArgs {
    #[serde(rename = "projectPath")]
    project_path: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
struct UiSaveProjectArgs {
    #[serde(rename = "projectPath")]
    project_path: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
struct UiImportFromSidecarArgs {
    /// 本机 `*.ui.json` 路径（由 wc3-template-export 生成）
    path: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
struct UiApplyActionsArgs {
    actions: Vec<serde_json::Value>,
    #[serde(default)]
    dry_run: Option<bool>,
    #[serde(default)]
    session_id: Option<String>,
    #[serde(default)]
    allow_dangerous: Option<bool>,
}

#[derive(Debug, Deserialize, JsonSchema)]
struct UiExportCodeArgs {
    #[serde(rename = "outputPath")]
    output_path: String,
    #[serde(default)]
    plugin_id: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
struct UiGetAuditArgs {
    #[serde(default)]
    limit: Option<usize>,
    #[serde(default)]
    session_id: Option<String>,
    #[serde(default)]
    action_id: Option<String>,
    #[serde(rename = "type")]
    action_type: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
struct UiGetTxAuditArgs {
    #[serde(default)]
    limit: Option<usize>,
    #[serde(default)]
    transaction_id: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
struct UiRuntimeCallArgs {
    method: String,
    #[serde(default)]
    params: serde_json::Value,
    #[serde(default)]
    timeout_ms: Option<u64>,
}

#[derive(Debug, Deserialize, JsonSchema)]
struct UiRuntimeTransactionArgs {
    actions: Vec<serde_json::Value>,
    #[serde(default)]
    validate_after_apply: Option<bool>,
    #[serde(default)]
    timeout_ms: Option<u64>,
    #[serde(default)]
    transaction_id: Option<String>,
}

#[tool_router(server_handler)]
impl UiDesignerMcp {
    #[tool(description = "打开并加载 .uiproj 项目")]
    async fn ui_open_project(
        &self,
        Parameters(args): Parameters<UiOpenProjectArgs>,
    ) -> Result<Json<UiDesignerEnvelope>, McpError> {
        let mut eng = self.engine.lock().await;
        let snap = eng
            .open_project(args.project_path)
            .await
            .map_err(|e| McpError::internal_error(e, None))?;
        let diags: Vec<String> = snap.diagnostics.clone();
        let v = serde_json::to_value(&snap).map_err(|e| McpError::internal_error(e.to_string(), None))?;
        Ok(Json(ok_envelope(v, diags)))
    }

    #[tool(description = "保存当前项目到磁盘")]
    async fn ui_save_project(
        &self,
        Parameters(args): Parameters<UiSaveProjectArgs>,
    ) -> Result<Json<UiDesignerEnvelope>, McpError> {
        let mut eng = self.engine.lock().await;
        let r = eng
            .save_project(args.project_path)
            .await
            .map_err(|e| McpError::internal_error(e, None))?;
        Ok(Json(ok_envelope(r, vec![])))
    }

    #[tool(description = "从 wc3-template-export 生成的 *.ui.json sidecar 反向导入项目快照（用于 yarn ui:push）")]
    async fn ui_import_from_sidecar(
        &self,
        Parameters(args): Parameters<UiImportFromSidecarArgs>,
    ) -> Result<Json<UiDesignerEnvelope>, McpError> {
        let snap = {
            let mut eng = self.engine.lock().await;
            eng.import_from_sidecar(args.path)
                .await
                .map_err(|e| McpError::internal_error(e, None))?
        };
        let diags = snap.diagnostics.clone();
        let snap_value = serde_json::to_value(&snap)
            .map_err(|e| McpError::internal_error(e.to_string(), None))?;

        // 尽力而为：若设计器前端在跑，把快照推过去让画布立即刷新；
        // 不在跑时（例如纯 CI 调用）忽略错误，不破坏返回值。
        let _ = self
            .runtime
            .dispatch(
                "replaceProjectSnapshot",
                json!({ "snapshot": snap_value }),
                5_000,
            )
            .await;

        Ok(Json(ok_envelope(snap_value, diags)))
    }

    #[tool(description = "获取当前项目快照（引擎侧）")]
    async fn ui_get_snapshot(&self) -> Result<Json<UiDesignerEnvelope>, McpError> {
        let eng = self.engine.lock().await;
        let snap = eng.get_snapshot();
        let diags = snap.diagnostics.clone();
        let v = serde_json::to_value(&snap).map_err(|e| McpError::internal_error(e.to_string(), None))?;
        Ok(Json(ok_envelope(v, diags)))
    }

    #[tool(description = "批量应用动作（create/update/delete/setParent）")]
    async fn ui_apply_actions(
        &self,
        Parameters(args): Parameters<UiApplyActionsArgs>,
    ) -> Result<Json<UiDesignerEnvelope>, McpError> {
        let mut eng = self.engine.lock().await;
        let r = eng.apply_actions(
            &args.actions,
            ApplyOptions {
                dry_run: args.dry_run.unwrap_or(false),
                session_id: args.session_id,
                allow_dangerous: args.allow_dangerous.unwrap_or(false),
            },
        );
        let mut diags: Vec<String> = r.errors.clone();
        diags.extend(r.warnings.clone());
        let v = serde_json::to_value(&r).map_err(|e| McpError::internal_error(e.to_string(), None))?;
        Ok(Json(ok_envelope(v, diags)))
    }

    #[tool(description = "按插件导出代码到文件")]
    async fn ui_export_code(
        &self,
        Parameters(args): Parameters<UiExportCodeArgs>,
    ) -> Result<Json<UiDesignerEnvelope>, McpError> {
        let eng = self.engine.lock().await;
        let out = eng
            .export_code(&args.output_path, args.plugin_id.as_deref())
            .await
            .map_err(|e| McpError::internal_error(e, None))?;
        Ok(Json(ok_envelope(out, vec![])))
    }

    #[tool(description = "导出结构化 JSON（内容在返回的 data.content）")]
    async fn ui_export_structured_json(&self) -> Result<Json<UiDesignerEnvelope>, McpError> {
        let eng = self.engine.lock().await;
        let content = eng.export_structured_json();
        Ok(Json(ok_envelope(json!({ "content": content }), vec![])))
    }

    #[tool(description = "校验当前项目")]
    async fn ui_validate(&self) -> Result<Json<UiDesignerEnvelope>, McpError> {
        let eng = self.engine.lock().await;
        let r = eng.validate();
        let diags = r.diagnostics.clone();
        let v = serde_json::to_value(&r).map_err(|e| McpError::internal_error(e.to_string(), None))?;
        Ok(Json(ok_envelope(v, diags)))
    }

    #[tool(description = "读取动作审计（可过滤 sessionId / actionId / type）")]
    async fn ui_get_audit_trail(
        &self,
        Parameters(args): Parameters<UiGetAuditArgs>,
    ) -> Result<Json<UiDesignerEnvelope>, McpError> {
        let eng = self.engine.lock().await;
        let limit = args.limit.unwrap_or(100);
        let mut events = eng.get_audit_trail(limit);
        if let Some(ref s) = args.session_id {
            events.retain(|e| e.session_id == *s);
        }
        if let Some(ref a) = args.action_id {
            events.retain(|e| e.action_id == *a);
        }
        if let Some(ref t) = args.action_type {
            events.retain(|e| e.action_type == *t);
        }
        Ok(Json(ok_envelope(json!({ "events": events }), vec![])))
    }

    #[tool(description = "读取事务级审计")]
    async fn ui_get_transaction_audit_trail(
        &self,
        Parameters(args): Parameters<UiGetTxAuditArgs>,
    ) -> Result<Json<UiDesignerEnvelope>, McpError> {
        let eng = self.engine.lock().await;
        let limit = args.limit.unwrap_or(100);
        let mut events = eng.get_transaction_audit_trail(limit);
        if let Some(ref tid) = args.transaction_id {
            events.retain(|e| e.transaction_id == *tid);
        }
        Ok(Json(ok_envelope(json!({ "events": events }), vec![])))
    }

    #[tool(description = "调用运行态方法（需设计器 UI；经事件桥接，无文件队列）")]
    async fn ui_runtime_call(
        &self,
        Parameters(args): Parameters<UiRuntimeCallArgs>,
    ) -> Result<Json<UiDesignerEnvelope>, McpError> {
        let timeout = args.timeout_ms.unwrap_or(15_000);
        let data = self
            .runtime
            .dispatch(&args.method, args.params, timeout)
            .await
            .map_err(|e| McpError::internal_error(e, None))?;
        Ok(Json(ok_envelope(json!({ "method": args.method, "data": data }), vec![])))
    }

    #[tool(description = "运行态事务：应用动作并在失败时回滚快照")]
    async fn ui_runtime_transaction(
        &self,
        Parameters(args): Parameters<UiRuntimeTransactionArgs>,
    ) -> Result<Json<UiDesignerEnvelope>, McpError> {
        let timeout = args.timeout_ms.unwrap_or(20_000);
        let tx_id = args
            .transaction_id
            .clone()
            .unwrap_or_else(|| format!("tx-{}", chrono_timestamp_ms()));
        let session_id = format!("session-{}-{}", tx_id, chrono_timestamp_ms());

        let enriched: Vec<serde_json::Value> = args
            .actions
            .iter()
            .enumerate()
            .map(|(i, a)| {
                let mut o = a.clone();
                if o.get("actionId").is_none() && o.get("idempotencyKey").is_none() {
                    if let Some(obj) = o.as_object_mut() {
                        obj.insert(
                            "actionId".into(),
                            json!(format!("action-{}-{}", i + 1, chrono_timestamp_ms())),
                        );
                    }
                }
                o
            })
            .collect();

        {
            let mut eng = self.engine.lock().await;
            eng.append_transaction_event(TransactionAuditEvent {
                transaction_id: tx_id.clone(),
                session_id: session_id.clone(),
                phase: "start".into(),
                action_count: Some(enriched.len()),
                reason: None,
                at: None,
            });
        }

        let before = self
            .runtime
            .dispatch("getProjectSnapshot", json!({}), timeout)
            .await
            .map_err(|e| McpError::internal_error(e, None))?;

        let apply_result = self
            .runtime
            .dispatch(
                "batchApply",
                json!({ "actions": enriched, "sessionId": session_id }),
                timeout,
            )
            .await
            .map_err(|e| McpError::internal_error(e, None))?;

        let apply_ok = apply_result
            .get("ok")
            .and_then(|x| x.as_bool())
            .unwrap_or(true);
        let apply_errors = apply_result
            .get("errors")
            .and_then(|x| x.as_array())
            .map(|a| !a.is_empty())
            .unwrap_or(false);
        if !apply_ok || apply_errors {
            let _ = self
                .runtime
                .dispatch(
                    "replaceProjectSnapshot",
                    json!({ "snapshot": before }),
                    timeout,
                )
                .await;
            let mut eng = self.engine.lock().await;
            eng.append_transaction_event(TransactionAuditEvent {
                transaction_id: tx_id.clone(),
                session_id: session_id.clone(),
                phase: "rollback".into(),
                action_count: None,
                reason: Some("apply_failed".into()),
                at: None,
            });
            let action_ids: Vec<String> = enriched
                .iter()
                .filter_map(|a| {
                    a.get("actionId")
                        .or_else(|| a.get("idempotencyKey"))
                        .and_then(|x| x.as_str())
                        .map(|s| s.to_string())
                })
                .collect();
            let body = json!({
                "transactionId": tx_id,
                "sessionId": session_id,
                "actionIds": action_ids,
                "rolledBack": true,
                "applyResult": apply_result
            });
            return Ok(Json(ok_envelope(
                body,
                vec!["runtime transaction failed and rolled back".into()],
            )));
        }

        if args.validate_after_apply.unwrap_or(true) {
            let validate_result = self
                .runtime
                .dispatch("validate", json!({}), timeout)
                .await
                .map_err(|e| McpError::internal_error(e, None))?;
            let v_ok = validate_result
                .get("ok")
                .and_then(|x| x.as_bool())
                .unwrap_or(true);
            let v_diag = validate_result
                .get("diagnostics")
                .and_then(|x| x.as_array())
                .map(|a| !a.is_empty())
                .unwrap_or(false);
            if !v_ok || v_diag {
                let _ = self
                    .runtime
                    .dispatch(
                        "replaceProjectSnapshot",
                        json!({ "snapshot": before }),
                        timeout,
                    )
                    .await;
                let mut eng = self.engine.lock().await;
                eng.append_transaction_event(TransactionAuditEvent {
                    transaction_id: tx_id.clone(),
                    session_id: session_id.clone(),
                    phase: "rollback".into(),
                    action_count: None,
                    reason: Some("validate_failed".into()),
                    at: None,
                });
                let action_ids: Vec<String> = enriched
                    .iter()
                    .filter_map(|a| {
                        a.get("actionId")
                            .or_else(|| a.get("idempotencyKey"))
                            .and_then(|x| x.as_str())
                            .map(|s| s.to_string())
                    })
                    .collect();
                let body = json!({
                    "transactionId": tx_id,
                    "sessionId": session_id,
                    "actionIds": action_ids,
                    "rolledBack": true,
                    "applyResult": apply_result,
                    "validateResult": validate_result
                });
                return Ok(Json(ok_envelope(
                    body,
                    vec!["runtime validation failed and rolled back".into()],
                )));
            }
        }

        {
            let mut eng = self.engine.lock().await;
            eng.append_transaction_event(TransactionAuditEvent {
                transaction_id: tx_id.clone(),
                session_id: session_id.clone(),
                phase: "commit".into(),
                action_count: None,
                reason: None,
                at: None,
            });
        }

        let action_ids: Vec<String> = enriched
            .iter()
            .filter_map(|a| {
                a.get("actionId")
                    .or_else(|| a.get("idempotencyKey"))
                    .and_then(|x| x.as_str())
                    .map(|s| s.to_string())
            })
            .collect();

        Ok(Json(ok_envelope(
            json!({
                "transactionId": tx_id,
                "sessionId": session_id,
                "actionIds": action_ids,
                "rolledBack": false,
                "applyResult": apply_result,
                "validateResult": serde_json::Value::Null
            }),
            vec![],
        )))
    }
}

fn chrono_timestamp_ms() -> u128 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

async fn health() -> impl IntoResponse {
    AxumJson(json!({
        "ok": true,
        "data": { "status": "ok", "mcp": "rust-rmcp" },
        "diagnostics": [],
        "protocol": protocol_meta().clone()
    }))
}

pub async fn run_mcp_stack(
    cancel: CancellationToken,
    runtime: Arc<RuntimeBridge>,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let port: u16 = std::env::var("UI_DESIGNER_MCP_HTTP_PORT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(8765);

    let engine = Arc::new(Mutex::new(ProjectEngine::new()));
    let engine_c = engine.clone();
    let runtime_c = runtime.clone();

    // 须使用有状态会话（默认）：initialize 返回 Mcp-Session-Id，后续请求携带该头。
    // Cursor / VS Code 等客户端依赖此流程；无状态 + 纯 JSON 会导致无法列出工具。
    let stream_cfg = StreamableHttpServerConfig::default()
        .with_cancellation_token(cancel.child_token());

    let mcp_service: StreamableHttpService<UiDesignerMcp, LocalSessionManager> =
        StreamableHttpService::new(
            move || Ok(UiDesignerMcp::new(engine_c.clone(), runtime_c.clone())),
            Arc::new(LocalSessionManager::default()),
            stream_cfg,
        );

    let mcp_path = std::env::var("UI_DESIGNER_MCP_STREAM_PATH").unwrap_or_else(|_| "/mcp".to_string());

    let router = Router::new()
        .route("/health", get(health))
        .route_service(&mcp_path, mcp_service.clone())
        .route_service("/", mcp_service);

    let addr = format!("127.0.0.1:{}", port);
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    log::info!("[ui-designer] MCP (rmcp) listening on http://{}/ (paths / & {})", addr, mcp_path);

    axum::serve(listener, router)
        .with_graceful_shutdown(async move {
            cancel.cancelled().await;
        })
        .await?;

    Ok(())
}
