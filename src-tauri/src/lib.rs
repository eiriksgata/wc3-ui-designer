use std::{
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::Mutex,
};

use tauri::{Manager, State};

struct McpServerState {
    child: Mutex<Option<Child>>,
}

fn resolve_mcp_script_path() -> Option<PathBuf> {
    if let Ok(explicit_path) = std::env::var("UI_DESIGNER_MCP_SCRIPT_PATH") {
        let path = PathBuf::from(explicit_path);
        if path.exists() {
            return Some(path);
        }
    }

    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Ok(cwd) = std::env::current_dir() {
        candidates.push(cwd.join("mcp").join("start-http-stack.mjs"));
        candidates.push(cwd.join("..").join("mcp").join("start-http-stack.mjs"));
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            candidates.push(parent.join("mcp").join("start-http-stack.mjs"));
            candidates.push(parent.join("..").join("..").join("mcp").join("start-http-stack.mjs"));
            candidates.push(parent.join("..").join("..").join("..").join("mcp").join("start-http-stack.mjs"));
        }
    }

    candidates.into_iter().find(|path| path.exists())
}

fn start_mcp_server_inner(state: &McpServerState) -> Result<String, String> {
    {
        let guard = state
            .child
            .lock()
            .map_err(|e| format!("MCP 进程状态锁定失败: {e}"))?;
        if let Some(child) = guard.as_ref() {
            return Ok(format!("MCP Server 已运行 (pid={})", child.id()));
        }
    }

    let script_path = resolve_mcp_script_path()
        .ok_or_else(|| "未找到 mcp/start-http-stack.mjs，请检查项目目录或设置 UI_DESIGNER_MCP_SCRIPT_PATH".to_string())?;
    let script_str = script_path
        .to_str()
        .ok_or_else(|| "MCP 脚本路径不是有效 UTF-8".to_string())?;

    let mut command = Command::new("node");
    command
        .arg(script_str)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    let child = command
        .spawn()
        .map_err(|e| format!("启动 MCP Server 失败，请确认 node 可用: {e}"))?;
    let pid = child.id();

    let mut guard = state
        .child
        .lock()
        .map_err(|e| format!("MCP 进程状态锁定失败: {e}"))?;
    *guard = Some(child);

    Ok(format!("MCP Server 启动成功 (pid={pid})"))
}

fn stop_mcp_server_inner(state: &McpServerState) -> Result<String, String> {
    let mut guard = state
        .child
        .lock()
        .map_err(|e| format!("MCP 进程状态锁定失败: {e}"))?;
    if let Some(mut child) = guard.take() {
        child
            .kill()
            .map_err(|e| format!("停止 MCP Server 失败: {e}"))?;
        let _ = child.wait();
        return Ok("MCP Server 已停止".to_string());
    }
    Ok("MCP Server 未运行".to_string())
}

fn get_mcp_server_status_inner(state: &McpServerState) -> Result<(bool, Option<u32>), String> {
    let mut guard = state
        .child
        .lock()
        .map_err(|e| format!("MCP 进程状态锁定失败: {e}"))?;
    if let Some(child) = guard.as_mut() {
        match child.try_wait() {
            Ok(Some(_)) => {
                // 进程已退出，清理句柄
                *guard = None;
                Ok((false, None))
            }
            Ok(None) => Ok((true, Some(child.id()))),
            Err(e) => Err(format!("读取 MCP 进程状态失败: {e}")),
        }
    } else {
        Ok((false, None))
    }
}

#[tauri::command]
async fn start_mcp_server(state: State<'_, McpServerState>) -> Result<String, String> {
    start_mcp_server_inner(&state)
}

#[tauri::command]
async fn stop_mcp_server(state: State<'_, McpServerState>) -> Result<String, String> {
    stop_mcp_server_inner(&state)
}

#[tauri::command]
async fn get_mcp_server_status(
    state: State<'_, McpServerState>,
) -> Result<serde_json::Value, String> {
    let (running, pid) = get_mcp_server_status_inner(&state)?;
    Ok(serde_json::json!({
        "running": running,
        "pid": pid,
    }))
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
        .manage(McpServerState {
            child: Mutex::new(None),
        })
        // 日志插件（仅调试模式）
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // 默认自动启动本地 MCP HTTP 栈（网关 + 运行态桥接），可通过环境变量显式关闭
            let auto_start = std::env::var("UI_DESIGNER_AUTO_START_MCP")
                .map(|value| value != "0" && value.to_lowercase() != "false")
                .unwrap_or(true);
            if auto_start {
                let state = app.state::<McpServerState>();
                if let Err(err) = start_mcp_server_inner(&state) {
                    eprintln!("[ui-designer] 自动启动 MCP HTTP 栈失败: {err}");
                }
            }
            Ok(())
        })
        // 文件对话框插件
        .plugin(tauri_plugin_dialog::init())
        // 文件系统插件
        .plugin(tauri_plugin_fs::init())
        // 注册命令
        .invoke_handler(tauri::generate_handler![
            open_file_with_default_editor,
            send_f4_to_war3,
            start_mcp_server,
            stop_mcp_server,
            get_mcp_server_status
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        if let tauri::RunEvent::Exit = event {
            let state = app_handle.state::<McpServerState>();
            let _ = stop_mcp_server_inner(&state);
        }
    });
}
