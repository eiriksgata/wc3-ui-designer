//! 全局资源库 —— 跨项目共享的、由用户主动配置路径的资源仓库。
//!
//! 设计要点：
//! - 所有磁盘 IO（读目录/读文件/写文件/删除/迁移）都在 Rust 侧直接用 `std::fs`
//!   完成，**不经** `@tauri-apps/plugin-fs`，因此不受 `fs:scope` 白名单限制——
//!   用户把全局库放到 `D:\`、`E:\`、外接盘、网络盘都能用。
//! - 后端**不兜底到 `appLocalDataDir`**。所有 command 都把 `root` 作为入参，
//!   由前端根据用户在 Settings 里填的 `globalResourceRootPath` 传入。
//! - BLP 编解码走 `image_blp` crate（BLP1 + JPEG with alpha，兼容 WC3）。
//!   不可用时，`convertToBlp` 会以结构化 warning 的形式降级为"仅拷贝"。

use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use base64::Engine as _;
use base64::engine::general_purpose::STANDARD as B64;
use image::ImageOutputFormat;
use image::imageops::FilterType;
use image_blp::convert::{blp_to_image, image_to_blp, BlpOldFormat, BlpTarget};
use image_blp::encode::save_blp;
use image_blp::parser::load_blp;
use image_blp::types::BlpImage as BlpImageType;
use serde::{Deserialize, Serialize};

// ----------------------------- Data types -----------------------------

/// 对应前端 ImageResource 的子集；前端拿到后自行拼成完整条目。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GlobalResourceEntry {
    /// 文件名（含扩展名）。
    pub name: String,
    /// 相对库根的路径，使用反斜杠分隔，符合 WC3 imported 路径风格。
    pub rel_path: String,
    /// 绝对路径（用于前端通过 `readFile` 拉取字节做预览，或落到项目资源）。
    pub abs_path: String,
    /// 文件大小（字节）。
    pub size: u64,
    /// 修改时间戳（毫秒）。
    pub mtime_ms: i64,
    /// 小写扩展名，不含点。
    pub ext: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SetRootResult {
    pub ok: bool,
    pub normalized_path: String,
    pub writable: bool,
    pub created: bool,
    pub message: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportRequest {
    pub root: String,
    pub sources: Vec<String>,
    #[serde(default)]
    pub sub_dir: String,
    #[serde(default)]
    pub convert_to_blp: bool,
    #[serde(default)]
    pub overwrite: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportWarning {
    pub source: String,
    pub message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub entries: Vec<GlobalResourceEntry>,
    pub warnings: Vec<ImportWarning>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrateResult {
    pub moved_count: u64,
    pub total_bytes: u64,
    pub warnings: Vec<ImportWarning>,
}

// ----------------------------- Helpers --------------------------------

const ALLOWED_EXTS: &[&str] = &["blp", "png", "tga", "bmp", "jpg", "jpeg"];

fn is_image_ext(ext: &str) -> bool {
    ALLOWED_EXTS.contains(&ext)
}

fn normalize_root(root: &str) -> PathBuf {
    PathBuf::from(root.trim())
}

fn mtime_millis(meta: &fs::Metadata) -> i64 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn ext_of(path: &Path) -> String {
    path.extension()
        .and_then(|s| s.to_str())
        .map(|s| s.to_ascii_lowercase())
        .unwrap_or_default()
}

/// 把相对路径里的正/反斜杠统一成反斜杠，并去除首尾分隔符。
fn normalize_rel(rel: &str) -> String {
    let replaced: String = rel.chars().map(|c| if c == '/' { '\\' } else { c }).collect();
    replaced
        .trim_matches(|c: char| c == '\\')
        .to_string()
}

/// 解决命名冲突：若 `overwrite=false`，追加 `-1 / -2 / ...` 后缀直到文件不存在。
fn resolve_target(dir: &Path, stem: &str, ext: &str, overwrite: bool) -> PathBuf {
    let first = dir.join(format!("{stem}.{ext}"));
    if overwrite || !first.exists() {
        return first;
    }
    for i in 1..=1024 {
        let cand = dir.join(format!("{stem}-{i}.{ext}"));
        if !cand.exists() {
            return cand;
        }
    }
    first
}

fn rel_from_root(root: &Path, abs: &Path) -> String {
    abs.strip_prefix(root)
        .ok()
        .and_then(|p| p.to_str())
        .map(|s| s.replace('/', "\\"))
        .unwrap_or_else(|| {
            abs.file_name()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_string()
        })
}

fn to_entry(root: &Path, abs: &Path) -> Option<GlobalResourceEntry> {
    let meta = fs::metadata(abs).ok()?;
    if !meta.is_file() {
        return None;
    }
    let name = abs.file_name()?.to_str()?.to_string();
    let ext = ext_of(abs);
    if !is_image_ext(&ext) {
        return None;
    }
    Some(GlobalResourceEntry {
        name,
        rel_path: rel_from_root(root, abs),
        abs_path: abs.to_string_lossy().to_string(),
        size: meta.len(),
        mtime_ms: mtime_millis(&meta),
        ext,
    })
}

fn walk_collect(root: &Path, dir: &Path, out: &mut Vec<GlobalResourceEntry>) -> std::io::Result<()> {
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(e) => return Err(e),
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let file_name = match entry.file_name().to_str() {
            Some(s) => s.to_string(),
            None => continue,
        };
        if file_name.starts_with('.') {
            // 跳过 .trash 等隐藏目录/点文件
            continue;
        }
        let ft = match entry.file_type() {
            Ok(t) => t,
            Err(_) => continue,
        };
        if ft.is_dir() {
            let _ = walk_collect(root, &path, out);
        } else if ft.is_file() {
            if let Some(e) = to_entry(root, &path) {
                out.push(e);
            }
        }
    }
    Ok(())
}

fn probe_writable(root: &Path) -> bool {
    let test_path = root.join(".ui-designer-write-test");
    match fs::OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .open(&test_path)
    {
        Ok(mut f) => {
            let ok = f.write_all(b"ok").is_ok();
            drop(f);
            let _ = fs::remove_file(&test_path);
            ok
        }
        Err(_) => false,
    }
}

/// BLP 编码：对任意 DynamicImage → BLP1+JPEG（带 alpha），WC3 最兼容。
fn encode_blp(img: image::DynamicImage, dst: &Path) -> Result<(), String> {
    let blp: BlpImageType = image_to_blp(
        img,
        /* make_mipmaps */ true,
        BlpTarget::Blp1(BlpOldFormat::Jpeg { has_alpha: true }),
        FilterType::Lanczos3,
    )
    .map_err(|e| format!("BLP 编码失败: {e}"))?;

    save_blp(&blp, dst).map_err(|e| format!("BLP 写入失败: {e}"))?;
    Ok(())
}

/// BLP 解码为 image::DynamicImage（取 0 级 mipmap）。
fn decode_blp_image(path: &Path) -> Result<image::DynamicImage, String> {
    let blp = load_blp(path).map_err(|e| format!("BLP 读取失败: {e}"))?;
    let img = blp_to_image(&blp, 0).map_err(|e| format!("BLP 转换失败: {e}"))?;
    Ok(img)
}

// ----------------------------- Commands --------------------------------

/// 校验路径合法性 + 目录不存在则创建 + 探测写权限。
#[tauri::command]
pub fn global_resource_set_root(root: String) -> SetRootResult {
    let path = normalize_root(&root);
    if path.as_os_str().is_empty() {
        return SetRootResult {
            ok: false,
            normalized_path: String::new(),
            writable: false,
            created: false,
            message: "路径为空".to_string(),
        };
    }
    let mut created = false;
    if !path.exists() {
        if let Err(e) = fs::create_dir_all(&path) {
            return SetRootResult {
                ok: false,
                normalized_path: path.to_string_lossy().to_string(),
                writable: false,
                created: false,
                message: format!("创建目录失败: {e}"),
            };
        }
        created = true;
    }
    if !path.is_dir() {
        return SetRootResult {
            ok: false,
            normalized_path: path.to_string_lossy().to_string(),
            writable: false,
            created,
            message: "目标路径不是目录".to_string(),
        };
    }
    let writable = probe_writable(&path);
    SetRootResult {
        ok: writable,
        normalized_path: path.to_string_lossy().to_string(),
        writable,
        created,
        message: if writable {
            "OK".to_string()
        } else {
            "目录不可写（可能权限不足）".to_string()
        },
    }
}

#[tauri::command]
pub fn global_resource_list(root: String) -> Vec<GlobalResourceEntry> {
    let path = normalize_root(&root);
    if path.as_os_str().is_empty() || !path.is_dir() {
        return Vec::new();
    }
    let mut out: Vec<GlobalResourceEntry> = Vec::new();
    let _ = walk_collect(&path, &path, &mut out);
    out.sort_by(|a, b| a.rel_path.to_lowercase().cmp(&b.rel_path.to_lowercase()));
    out
}

#[tauri::command]
pub fn global_resource_import(req: ImportRequest) -> ImportResult {
    let mut result = ImportResult {
        entries: Vec::new(),
        warnings: Vec::new(),
    };

    let root = normalize_root(&req.root);
    if root.as_os_str().is_empty() || !root.is_dir() {
        result.warnings.push(ImportWarning {
            source: req.root.clone(),
            message: "全局资源库根路径无效".to_string(),
        });
        return result;
    }

    let sub_dir = normalize_rel(&req.sub_dir);
    let dst_dir = if sub_dir.is_empty() {
        root.clone()
    } else {
        root.join(sub_dir.replace('\\', std::path::MAIN_SEPARATOR_STR))
    };
    if !dst_dir.exists() {
        if let Err(e) = fs::create_dir_all(&dst_dir) {
            result.warnings.push(ImportWarning {
                source: req.sub_dir.clone(),
                message: format!("创建子目录失败: {e}"),
            });
            return result;
        }
    }

    // 把入参里混进来的"目录"展开成其中所有图片文件（保留相对子目录结构）。
    // 这样用户从全局库 Tab 直接拖一个 `ui` 文件夹进来也能用。
    // 元素是 (src_abs, extra_sub_dir_relative_to_dst_dir)。
    let mut expanded: Vec<(PathBuf, String)> = Vec::new();
    for src_raw in &req.sources {
        let src = PathBuf::from(src_raw);
        if src.is_dir() {
            let mut found: Vec<GlobalResourceEntry> = Vec::new();
            let _ = walk_collect(&src, &src, &mut found);
            if found.is_empty() {
                result.warnings.push(ImportWarning {
                    source: src_raw.clone(),
                    message: "目录里没有可导入的图片文件（支持 blp/png/tga/bmp/jpg/jpeg）"
                        .to_string(),
                });
                continue;
            }
            // 目录名作为最外层子目录，保留原文件在该目录内的相对层级。
            let dir_name = src
                .file_name()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_string();
            for e in found {
                // e.rel_path 是反斜杠风格 "子目录\\xxx.png"
                let parent_rel = {
                    let rp = e.rel_path.clone();
                    let norm: String = rp.replace('/', "\\");
                    match norm.rfind('\\') {
                        Some(idx) => norm[..idx].to_string(),
                        None => String::new(),
                    }
                };
                let extra = if dir_name.is_empty() {
                    parent_rel
                } else if parent_rel.is_empty() {
                    dir_name.clone()
                } else {
                    format!("{dir_name}\\{parent_rel}")
                };
                expanded.push((PathBuf::from(&e.abs_path), extra));
            }
        } else if src.is_file() {
            expanded.push((src, String::new()));
        } else {
            result.warnings.push(ImportWarning {
                source: src_raw.clone(),
                message: "源路径不存在或不可读".to_string(),
            });
        }
    }

    for (src, extra_sub) in &expanded {
        let src_raw_display = src.to_string_lossy().to_string();
        let src_ext = ext_of(src);
        if !is_image_ext(&src_ext) {
            result.warnings.push(ImportWarning {
                source: src_raw_display.clone(),
                message: format!("不支持的扩展名: .{src_ext}"),
            });
            continue;
        }

        let stem = src
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("image")
            .to_string();

        // 决定目标扩展名
        let want_convert =
            req.convert_to_blp && matches!(src_ext.as_str(), "png" | "jpg" | "jpeg" | "bmp" | "tga");
        let target_ext = if want_convert { "blp" } else { src_ext.as_str() };

        // 按"被展开的目录层级"决定最终目标目录。
        let this_dst_dir = if extra_sub.is_empty() {
            dst_dir.clone()
        } else {
            dst_dir.join(extra_sub.replace('\\', std::path::MAIN_SEPARATOR_STR))
        };
        if !this_dst_dir.exists() {
            if let Err(e) = fs::create_dir_all(&this_dst_dir) {
                result.warnings.push(ImportWarning {
                    source: src_raw_display.clone(),
                    message: format!("创建子目录失败: {e}"),
                });
                continue;
            }
        }
        let target = resolve_target(&this_dst_dir, &stem, target_ext, req.overwrite);

        let outcome = if want_convert {
            // 转换路径：load → encode BLP → 写入；失败时降级为原样拷贝。
            match image::open(src).map_err(|e| format!("加载图片失败: {e}")) {
                Ok(img) => {
                    if let Err(e) = encode_blp(img, &target) {
                        result.warnings.push(ImportWarning {
                            source: src_raw_display.clone(),
                            message: format!("转换 BLP 失败，已降级为直接拷贝原文件：{e}"),
                        });
                        // 回退：按原扩展名另起一个目标文件
                        let fallback = resolve_target(&this_dst_dir, &stem, &src_ext, req.overwrite);
                        match fs::copy(src, &fallback) {
                            Ok(_) => Some(fallback),
                            Err(e2) => {
                                result.warnings.push(ImportWarning {
                                    source: src_raw_display.clone(),
                                    message: format!("回退拷贝也失败: {e2}"),
                                });
                                None
                            }
                        }
                    } else {
                        Some(target)
                    }
                }
                Err(e) => {
                    result.warnings.push(ImportWarning {
                        source: src_raw_display.clone(),
                        message: format!("图片解码失败，已降级为直接拷贝：{e}"),
                    });
                    let fallback = resolve_target(&this_dst_dir, &stem, &src_ext, req.overwrite);
                    match fs::copy(src, &fallback) {
                        Ok(_) => Some(fallback),
                        Err(e2) => {
                            result.warnings.push(ImportWarning {
                                source: src_raw_display.clone(),
                                message: format!("回退拷贝也失败: {e2}"),
                            });
                            None
                        }
                    }
                }
            }
        } else {
            // 非转换路径：直接 copy
            match fs::copy(src, &target) {
                Ok(_) => Some(target),
                Err(e) => {
                    result.warnings.push(ImportWarning {
                        source: src_raw_display.clone(),
                        message: format!("拷贝失败: {e}"),
                    });
                    None
                }
            }
        };

        if let Some(abs) = outcome {
            if let Some(entry) = to_entry(&root, &abs) {
                result.entries.push(entry);
            }
        }
    }

    result
}

#[tauri::command]
pub fn global_resource_delete(root: String, rel_path: String) -> Result<(), String> {
    let root = normalize_root(&root);
    if root.as_os_str().is_empty() || !root.is_dir() {
        return Err("全局资源库根路径无效".to_string());
    }
    let rel = normalize_rel(&rel_path);
    if rel.is_empty() {
        return Err("relPath 为空".to_string());
    }
    let abs = root.join(rel.replace('\\', std::path::MAIN_SEPARATOR_STR));
    if !abs.starts_with(&root) {
        return Err("目标路径越界".to_string());
    }
    if !abs.exists() {
        return Ok(());
    }

    // 软删除：移动到 <root>/.trash/<timestamp>/<relPath>
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let trash_dir = root.join(".trash").join(ts.to_string());
    if let Err(e) = fs::create_dir_all(&trash_dir) {
        return Err(format!("创建 .trash 目录失败: {e}"));
    }
    let file_name = abs
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("deleted");
    let dst = trash_dir.join(file_name);
    match fs::rename(&abs, &dst) {
        Ok(_) => Ok(()),
        Err(_) => {
            // 跨设备 rename 可能失败 → 退化为拷贝 + 删除
            fs::copy(&abs, &dst).map_err(|e| format!("软删除拷贝失败: {e}"))?;
            fs::remove_file(&abs).map_err(|e| format!("删除原文件失败: {e}"))?;
            Ok(())
        }
    }
}

#[tauri::command]
pub fn global_resource_migrate(
    old_root: String,
    new_root: String,
    mode: String,
) -> MigrateResult {
    let mut out = MigrateResult {
        moved_count: 0,
        total_bytes: 0,
        warnings: Vec::new(),
    };
    let old_path = normalize_root(&old_root);
    let new_path = normalize_root(&new_root);

    if old_path.as_os_str().is_empty() || !old_path.is_dir() {
        out.warnings.push(ImportWarning {
            source: old_root.clone(),
            message: "旧全局库不存在".to_string(),
        });
        return out;
    }
    if new_path.as_os_str().is_empty() {
        out.warnings.push(ImportWarning {
            source: new_root.clone(),
            message: "新全局库路径为空".to_string(),
        });
        return out;
    }
    if let Err(e) = fs::create_dir_all(&new_path) {
        out.warnings.push(ImportWarning {
            source: new_root.clone(),
            message: format!("创建新全局库目录失败: {e}"),
        });
        return out;
    }

    let is_move = mode.eq_ignore_ascii_case("move");

    let mut files: Vec<GlobalResourceEntry> = Vec::new();
    let _ = walk_collect(&old_path, &old_path, &mut files);
    for f in &files {
        let rel_os = f.rel_path.replace('\\', std::path::MAIN_SEPARATOR_STR);
        let dst_abs = new_path.join(&rel_os);
        if let Some(parent) = dst_abs.parent() {
            if let Err(e) = fs::create_dir_all(parent) {
                out.warnings.push(ImportWarning {
                    source: f.rel_path.clone(),
                    message: format!("创建目标子目录失败: {e}"),
                });
                continue;
            }
        }
        let src_abs = PathBuf::from(&f.abs_path);

        let copy_ok = match fs::copy(&src_abs, &dst_abs) {
            Ok(_) => true,
            Err(e) => {
                out.warnings.push(ImportWarning {
                    source: f.rel_path.clone(),
                    message: format!("拷贝失败: {e}"),
                });
                false
            }
        };
        if copy_ok {
            out.moved_count += 1;
            out.total_bytes += f.size;
            if is_move {
                if let Err(e) = fs::remove_file(&src_abs) {
                    out.warnings.push(ImportWarning {
                        source: f.rel_path.clone(),
                        message: format!("迁移模式下删除源文件失败: {e}"),
                    });
                }
            }
        }
    }
    out
}

/// 将 BLP 解码为 PNG 的 base64 data URL，前端直接塞 `<img :src>`。
#[tauri::command]
pub fn blp_decode_to_png_base64(abs_path: String) -> Result<String, String> {
    let p = PathBuf::from(&abs_path);
    if !p.is_file() {
        return Err("BLP 文件不存在".to_string());
    }
    let img = decode_blp_image(&p)?;
    let mut buf: Vec<u8> = Vec::new();
    img.write_to(&mut std::io::Cursor::new(&mut buf), ImageOutputFormat::Png)
        .map_err(|e| format!("PNG 编码失败: {e}"))?;
    let b64 = B64.encode(&buf);
    Ok(format!("data:image/png;base64,{b64}"))
}

#[tauri::command]
pub fn path_exists(path: String) -> bool {
    let p = PathBuf::from(path);
    p.exists()
}

/// 返回某路径所在盘的可用字节数；无法获取时返回 0。
#[tauri::command]
pub fn disk_free_space(path: String) -> u64 {
    let p = PathBuf::from(&path);
    // 直接走 winapi 更准；暂时用跨平台简单实现：尝试探测父目录。
    let probe = if p.exists() { p.clone() } else {
        p.ancestors()
            .find(|a| a.exists())
            .map(|a| a.to_path_buf())
            .unwrap_or(p)
    };
    free_space_bytes(&probe).unwrap_or(0)
}

// 跨平台可用空间查询。Windows 用 GetDiskFreeSpaceExW；其它平台用 statvfs。
#[cfg(target_os = "windows")]
fn free_space_bytes(path: &Path) -> Option<u64> {
    use std::os::windows::ffi::OsStrExt;
    use windows::Win32::Foundation::GetLastError;
    use windows::Win32::Storage::FileSystem::GetDiskFreeSpaceExW;
    use windows::core::PCWSTR;

    let mut wide: Vec<u16> = path.as_os_str().encode_wide().collect();
    wide.push(0);

    let mut free_bytes_avail: u64 = 0;
    let mut total_bytes: u64 = 0;
    let mut total_free: u64 = 0;
    let ok = unsafe {
        GetDiskFreeSpaceExW(
            PCWSTR(wide.as_ptr()),
            Some(&mut free_bytes_avail),
            Some(&mut total_bytes),
            Some(&mut total_free),
        )
    };
    let _ = unsafe { GetLastError() }; // 抑制未用告警
    if ok.is_ok() {
        Some(free_bytes_avail)
    } else {
        None
    }
}

#[cfg(not(target_os = "windows"))]
fn free_space_bytes(_path: &Path) -> Option<u64> {
    None
}

/// 把一个文件整体读出来，返回 base64。用于前端预览 PNG/JPG/BMP/TGA 全局库文件，
/// 避开 `@tauri-apps/plugin-fs` 的 scope 限制（因为全局库可能在用户自选的任意盘）。
#[tauri::command]
pub fn read_file_as_base64(abs_path: String) -> Result<String, String> {
    let p = PathBuf::from(&abs_path);
    let mut f = fs::File::open(&p).map_err(|e| format!("打开文件失败: {e}"))?;
    let mut buf: Vec<u8> = Vec::new();
    f.read_to_end(&mut buf).map_err(|e| format!("读取文件失败: {e}"))?;
    Ok(B64.encode(&buf))
}
