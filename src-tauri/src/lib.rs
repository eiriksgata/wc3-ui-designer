use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::Command;

#[derive(Debug, Serialize, Deserialize)]
struct Widget {
    id: Option<u32>,
    #[serde(rename = "type")]
    widget_type: String,
    x: f64,
    y: f64,
    w: f64,
    h: f64,
    text: String,
    name: Option<String>,
    image: Option<String>,
    parent_id: Option<u32>,
    checked: Option<bool>,
    selected_index: Option<u32>,
}

// 对应前端传入的 options 对象（resourcePath / luaPath / mode / fileName / animations）
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExportOptions {
    resource_path: Option<String>,
    lua_path: Option<String>,
    mode: Option<String>,
    file_name: Option<String>,
    // 额外传给 Lua 插件的动画数据（来自 options.animations）
    animations: Option<serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize)]
struct PluginInput {
    widgets: Vec<Widget>,
    options: ExportOptions,
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

// 执行 Lua 插件的命令
#[tauri::command]
async fn execute_lua_plugin(
    plugin_path: String,
    widgets: Vec<serde_json::Value>,
    options: serde_json::Value,
) -> Result<String, String> {
    // 获取 lua54.exe 的路径（相对于可执行文件）
    let exe_dir = std::env::current_exe()
        .map_err(|e| format!("获取可执行文件路径失败: {}", e))?
        .parent()
        .ok_or("无法获取可执行文件目录")?
        .to_path_buf();

    // 尝试多个可能的路径
    let lua_exe_paths = vec![
        exe_dir.join("lua54.exe"),
        exe_dir.join("lua54"),
        PathBuf::from("lua54.exe"),
        PathBuf::from("lua54"),
        // 开发环境可能在不同的位置
        PathBuf::from("src-tauri/lua54.exe"),
    ];

    let mut lua_exe = None;
    for path in &lua_exe_paths {
        if path.exists() {
            lua_exe = Some(path.clone());
            break;
        }
    }

    let lua_exe = lua_exe.ok_or_else(|| {
        format!(
            "找不到 lua54.exe，请将其放在以下位置之一: {:?}",
            lua_exe_paths
        )
    })?;

    // 检查插件文件是否存在（原始路径，可能包含中文）
    let original_plugin_path = PathBuf::from(&plugin_path);
    if !original_plugin_path.exists() {
        return Err(format!("插件文件不存在: {}", plugin_path));
    }

    // 构建输入数据
    let input = PluginInput {
        widgets: widgets
            .into_iter()
            .map(|w| {
                serde_json::from_value(w).unwrap_or_else(|_| Widget {
                    id: None,
                    widget_type: "Panel".to_string(),
                    x: 0.0,
                    y: 0.0,
                    w: 0.0,
                    h: 0.0,
                    text: String::new(),
                    name: None,
                    image: None,
                    parent_id: None,
                    checked: None,
                    selected_index: None,
                })
            })
            .collect(),
        options: serde_json::from_value(options).unwrap_or_else(|_| ExportOptions {
            resource_path: None,
            lua_path: None,
            mode: None,
            file_name: None,
            animations: None,
        }),
    };

    // 创建临时文件目录，用于输出和插件复制（避免中文路径导致 lua54.exe 打不开文件）
    let temp_dir = std::env::temp_dir();
    let output_file = temp_dir.join(format!("lua_plugin_output_{}.txt", uuid::Uuid::new_v4()));
    let temp_plugin_file = temp_dir.join(format!("lua_plugin_{}.lua", uuid::Uuid::new_v4()));

    // 将插件复制到仅包含 ASCII 的临时路径，避免 Windows + lua54 对中文路径支持问题
    std::fs::copy(&original_plugin_path, &temp_plugin_file).map_err(|e| {
        format!(
            "复制插件到临时目录失败: {} -> {}: {}",
            original_plugin_path.display(),
            temp_plugin_file.display(),
            e
        )
    })?;

    // 构建 Lua 表格式的输入数据（直接在 Rust 端生成，避免在 Lua 端解析 JSON）
    let mut widgets_lua = String::from("{");
    for (i, widget) in input.widgets.iter().enumerate() {
        if i > 0 {
            widgets_lua.push_str(", ");
        }
        widgets_lua.push_str("{");
        widgets_lua.push_str(&format!(
            "id = {}, ",
            widget
                .id
                .map(|v| v.to_string())
                .unwrap_or_else(|| "nil".to_string())
        ));
        widgets_lua.push_str(&format!(
            "type = \"{}\", ",
            widget
                .widget_type
                .replace('\\', "\\\\")
                .replace('"', "\\\"")
        ));
        widgets_lua.push_str(&format!("x = {}, ", widget.x));
        widgets_lua.push_str(&format!("y = {}, ", widget.y));
        widgets_lua.push_str(&format!("w = {}, ", widget.w));
        widgets_lua.push_str(&format!("h = {}, ", widget.h));
        widgets_lua.push_str(&format!(
            "text = \"{}\", ",
            widget.text.replace('\\', "\\\\").replace('"', "\\\"")
        ));
        if let Some(ref name) = widget.name {
            widgets_lua.push_str(&format!(
                "name = \"{}\", ",
                name.replace('\\', "\\\\").replace('"', "\\\"")
            ));
        } else {
            widgets_lua.push_str("name = nil, ");
        }
        if let Some(ref image) = widget.image {
            widgets_lua.push_str(&format!(
                "image = \"{}\", ",
                image.replace('\\', "\\\\").replace('"', "\\\"")
            ));
        } else {
            widgets_lua.push_str("image = nil, ");
        }
        widgets_lua.push_str(&format!(
            "parentId = {}, ",
            widget
                .parent_id
                .map(|v| v.to_string())
                .unwrap_or_else(|| "nil".to_string())
        ));
        if let Some(checked) = widget.checked {
            widgets_lua.push_str(&format!("checked = {}, ", checked));
        } else {
            widgets_lua.push_str("checked = nil, ");
        }
        widgets_lua.push_str(&format!(
            "selectedIndex = {}",
            widget
                .selected_index
                .map(|v| v.to_string())
                .unwrap_or_else(|| "nil".to_string())
        ));
        widgets_lua.push_str("}");
    }
    widgets_lua.push_str("}");

    // 将 JSON 动画数据转换为 Lua 表（简易序列化）
    fn json_to_lua(value: &serde_json::Value) -> String {
        match value {
            serde_json::Value::Null => "nil".to_string(),
            serde_json::Value::Bool(b) => b.to_string(),
            serde_json::Value::Number(n) => n.to_string(),
            serde_json::Value::String(s) => {
                let escaped = s.replace('\\', "\\\\").replace('"', "\\\"");
                format!("\"{}\"", escaped)
            }
            serde_json::Value::Array(arr) => {
                let mut out = String::from("{");
                for (i, v) in arr.iter().enumerate() {
                    if i > 0 {
                        out.push_str(", ");
                    }
                    out.push_str(&json_to_lua(v));
                }
                out.push('}');
                out
            }
            serde_json::Value::Object(map) => {
                let mut out = String::from("{");
                let mut first = true;
                for (k, v) in map.iter() {
                    if !first {
                        out.push_str(", ");
                    }
                    first = false;
                    // 键一律用字符串形式：["key"] = ...
                    let escaped_key = k.replace('\\', "\\\\").replace('"', "\\\"");
                    out.push_str(&format!("[\"{}\"] = {}", escaped_key, json_to_lua(v)));
                }
                out.push('}');
                out
            }
        }
    }

    let animations_lua = input
        .options
        .animations
        .as_ref()
        .map(|v| json_to_lua(v))
        .unwrap_or_else(|| "nil".to_string());

    let options_lua = format!(
        "{{ resourcePath = {}, luaPath = {}, mode = {}, fileName = {}, animations = {} }}",
        input
            .options
            .resource_path
            .as_ref()
            .map(|s| format!("\"{}\"", s.replace('\\', "\\\\").replace('"', "\\\"")))
            .unwrap_or_else(|| "nil".to_string()),
        input
            .options
            .lua_path
            .as_ref()
            .map(|s| format!("\"{}\"", s.replace('\\', "\\\\").replace('"', "\\\"")))
            .unwrap_or_else(|| "nil".to_string()),
        input
            .options
            .mode
            .as_ref()
            .map(|s| format!("\"{}\"", s.replace('\\', "\\\\").replace('"', "\\\"")))
            .unwrap_or_else(|| "nil".to_string()),
        input
            .options
            .file_name
            .as_ref()
            .map(|s| format!("\"{}\"", s.replace('\\', "\\\\").replace('"', "\\\"")))
            .unwrap_or_else(|| "nil".to_string()),
        animations_lua,
    );

    let output_file_escaped = output_file.to_string_lossy().replace('\\', "\\\\");
    // 这里使用临时插件路径，避免中文路径导致 lua54.exe dofile 失败
    let plugin_path_escaped = temp_plugin_file.to_string_lossy().replace('\\', "\\\\");

    // 创建一个包装脚本，直接使用 Lua 表数据调用插件
    let wrapper_script = format!(
        r#"
local output_file = [[{output_file}]]
local plugin_file = [[{plugin_file}]]

-- 直接使用 Rust 生成的 Lua 表数据
local widgets = {widgets_data}
local options = {options_data}

-- 加载插件
local plugin_func = dofile(plugin_file)

-- 执行插件（注意：插件返回的是函数，需要调用）
if type(plugin_func) == "function" then
    local result = plugin_func(widgets, options)
    
    -- 写入输出文件
    local output_handle = io.open(output_file, "w")
    if not output_handle then
        error("无法打开输出文件: " .. output_file)
    end
    output_handle:write(result or "")
    output_handle:close()
else
    error("插件必须返回一个函数，但得到: " .. type(plugin_func))
end
"#,
        output_file = output_file_escaped,
        plugin_file = plugin_path_escaped,
        widgets_data = widgets_lua,
        options_data = options_lua
    );

    let wrapper_file = temp_dir.join(format!("lua_wrapper_{}.lua", uuid::Uuid::new_v4()));
    std::fs::write(&wrapper_file, wrapper_script)
        .map_err(|e| format!("写入包装脚本失败: {}", e))?;

    // 执行 lua54.exe
    let output = Command::new(&lua_exe)
        .arg(&wrapper_file)
        .output()
        .map_err(|e| format!("执行 lua54.exe 失败: {}，请确保 lua54.exe 可执行", e))?;

    // 清理临时文件
    let _ = std::fs::remove_file(&wrapper_file);
    let _ = std::fs::remove_file(&temp_plugin_file);

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        let mut error_msg = format!("Lua 插件执行失败:\n");
        if !stderr.is_empty() {
            error_msg.push_str(&format!("错误输出:\n{}\n", stderr));
        }
        if !stdout.is_empty() {
            error_msg.push_str(&format!("标准输出:\n{}\n", stdout));
        }
        return Err(error_msg);
    }

    // 读取输出文件
    let result =
        std::fs::read_to_string(&output_file).map_err(|e| format!("读取输出文件失败: {}", e))?;

    // 清理输出文件
    let _ = std::fs::remove_file(&output_file);

    // 如果有 stdout 输出（比如 print 语句），也包含在结果中
    let stdout = String::from_utf8_lossy(&output.stdout);
    if !stdout.trim().is_empty() {
        // 将 stdout 添加到结果前面作为注释
        let stdout_comments = stdout
            .lines()
            .map(|line| format!("-- Lua 输出: {}", line))
            .collect::<Vec<_>>()
            .join("\n");
        Ok(format!("{}\n\n{}", stdout_comments, result))
    } else {
        Ok(result)
    }
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
        // 注册 Lua 插件执行命令和打开文件命令
        .invoke_handler(tauri::generate_handler![
            execute_lua_plugin,
            open_file_with_default_editor,
            send_f4_to_war3
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
