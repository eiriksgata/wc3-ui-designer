mod mcp_http;
mod project_engine;

use std::sync::Mutex;

use mcp_http::RuntimeBridge;
use tauri::{Manager, State};
use tokio_util::sync::CancellationToken;

struct McpHostState {
    cancel: Mutex<Option<CancellationToken>>,
    bridge: std::sync::Arc<RuntimeBridge>,
}

fn start_mcp_server_inner(state: &McpHostState) -> Result<String, String> {
    {
        let guard = state
            .cancel
            .lock()
            .map_err(|e| format!("MCP 状态锁定失败: {e}"))?;
        if guard.is_some() {
            return Ok("MCP（Rust rmcp）已在运行".to_string());
        }
    }

    let cancel = CancellationToken::new();
    {
        let mut guard = state
            .cancel
            .lock()
            .map_err(|e| format!("MCP 状态锁定失败: {e}"))?;
        *guard = Some(cancel.clone());
    }

    let bridge = state.bridge.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(e) = mcp_http::run_mcp_stack(cancel, bridge).await {
            log::error!("[ui-designer] MCP HTTP 栈退出: {e}");
        }
    });

    Ok("MCP（Rust rmcp）已启动".to_string())
}

fn stop_mcp_server_inner(state: &McpHostState) -> Result<String, String> {
    let mut guard = state
        .cancel
        .lock()
        .map_err(|e| format!("MCP 状态锁定失败: {e}"))?;
    if let Some(c) = guard.take() {
        c.cancel();
        return Ok("MCP 已停止".to_string());
    }
    Ok("MCP 未运行".to_string())
}

fn get_mcp_server_status_inner(state: &McpHostState) -> Result<(bool, Option<u32>), String> {
    let guard = state
        .cancel
        .lock()
        .map_err(|e| format!("MCP 状态锁定失败: {e}"))?;
    Ok((guard.is_some(), None))
}

#[tauri::command]
async fn start_mcp_server(state: State<'_, McpHostState>) -> Result<String, String> {
    start_mcp_server_inner(&state)
}

#[tauri::command]
async fn stop_mcp_server(state: State<'_, McpHostState>) -> Result<String, String> {
    stop_mcp_server_inner(&state)
}

#[tauri::command]
async fn get_mcp_server_status(state: State<'_, McpHostState>) -> Result<serde_json::Value, String> {
    let (running, pid) = get_mcp_server_status_inner(&state)?;
    Ok(serde_json::json!({
        "running": running,
        "pid": pid,
        "implementation": "rust-rmcp",
    }))
}

/// 前端完成运行态请求后回传结果，与 `mcp-runtime-request` 事件配对。
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct McpRuntimeBridgeReply {
    request_id: String,
    result: serde_json::Value,
}

#[tauri::command]
fn mcp_runtime_bridge_reply(
    state: State<'_, McpHostState>,
    reply: McpRuntimeBridgeReply,
) -> Result<(), String> {
    state.bridge.complete(&reply.request_id, reply.result);
    Ok(())
}

// 用系统默认编辑器打开文件
#[tauri::command]
async fn open_file_with_default_editor(file_path: String) -> Result<(), String> {
    use std::process::Command;

    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .args(["/C", "start", "", &file_path])
            .spawn()
            .map_err(|e| format!("打开文件失败: {}", e))?;
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(&file_path)
            .spawn()
            .map_err(|e| format!("打开文件失败: {}", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(&file_path)
            .spawn()
            .map_err(|e| format!("打开文件失败: {}", e))?;
    }

    Ok(())
}

// 在 Windows 上查找 war3.exe，并向其窗口发送 F4 键
#[tauri::command]
async fn send_f4_to_war3() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use windows::Win32::{
            Foundation::{BOOL, HWND, LPARAM},
            System::Diagnostics::ToolHelp::{
                CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
                TH32CS_SNAPPROCESS,
            },
            UI::WindowsAndMessaging::EnumWindows,
        };

        unsafe {
            // 枚举进程，找到名为 war3.exe 的进程 ID
            let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0)
                .map_err(|e| format!("创建进程快照失败: {e}"))?;

            let mut entry = PROCESSENTRY32W::default();
            entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;

            let mut target_pid: u32 = 0;
            if Process32FirstW(snapshot, &mut entry).is_ok() {
                loop {
                    let exe_name = String::from_utf16_lossy(
                        &entry.szExeFile
                            [..entry.szExeFile.iter().position(|&c| c == 0).unwrap_or(0)],
                    )
                    .to_lowercase();

                    if exe_name == "war3.exe" {
                        target_pid = entry.th32ProcessID;
                        break;
                    }

                    if Process32NextW(snapshot, &mut entry).is_err() {
                        break;
                    }
                }
            }

            if target_pid == 0 {
                return Err("未找到 war3.exe 进程".into());
            }

            // 在 EnumWindows 回调中给属于该进程的窗口发送 F4
            extern "system" fn enum_windows_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
                use windows::Win32::{
                    Foundation::{BOOL, LPARAM, WPARAM},
                    UI::{
                        Input::KeyboardAndMouse::VK_F4,
                        WindowsAndMessaging::{GetWindowThreadProcessId, PostMessageW, WM_KEYDOWN, WM_KEYUP},
                    },
                };

                let target_pid = lparam.0 as u32;
                let mut pid: u32 = 0;
                unsafe {
                    GetWindowThreadProcessId(hwnd, Some(&mut pid));
                    if pid == target_pid {
                        let vk = VK_F4.0 as u16 as u32;
                        let _ = PostMessageW(hwnd, WM_KEYDOWN, WPARAM(vk as usize), LPARAM(0));
                        let _ = PostMessageW(hwnd, WM_KEYUP, WPARAM(vk as usize), LPARAM(0));
                    }
                }
                BOOL(1)
            }

            EnumWindows(Some(enum_windows_proc), LPARAM(target_pid as isize))
                .map_err(|e| format!("枚举窗口失败: {e}"))?;

            Ok(())
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        Err("仅在 Windows 上支持发送 F4".into())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let bridge = std::sync::Arc::new(RuntimeBridge::new(app.handle().clone()));
            app.manage(McpHostState {
                cancel: Mutex::new(None),
                bridge: bridge.clone(),
            });

            let auto_start = std::env::var("UI_DESIGNER_AUTO_START_MCP")
                .map(|value| value != "0" && value.to_lowercase() != "false")
                .unwrap_or(true);
            if auto_start {
                let state = app.state::<McpHostState>();
                if let Err(err) = start_mcp_server_inner(&state) {
                    eprintln!("[ui-designer] 自动启动 MCP（Rust）失败: {err}");
                }
            }
            Ok(())
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            open_file_with_default_editor,
            send_f4_to_war3,
            start_mcp_server,
            stop_mcp_server,
            get_mcp_server_status,
            mcp_runtime_bridge_reply,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        if let tauri::RunEvent::Exit = event {
            let state = app_handle.state::<McpHostState>();
            let _ = stop_mcp_server_inner(&state);
        }
    });
}
