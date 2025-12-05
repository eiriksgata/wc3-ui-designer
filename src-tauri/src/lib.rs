use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::Command;

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
    tauri::Builder::default()
        // 日志插件（仅调试模式）
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
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
            send_f4_to_war3
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
