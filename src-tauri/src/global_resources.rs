//! 全局资源库 —— 跨项目共享的、由用户主动配置路径的资源仓库。
//!
//! 设计要点：
//! - 所有磁盘 IO（读目录/读文件/写文件/删除/迁移）都在 Rust 侧直接用 `std::fs`
//!   完成，**不经** `@tauri-apps/plugin-fs`，因此不受 `fs:scope` 白名单限制——
//!   用户把全局库放到 `D:\`、`E:\`、外接盘、网络盘都能用。
//! - 后端**不兜底到 `appLocalDataDir`**。所有 command 都把 `root` 作为入参，
//!   由前端根据用户在 Settings 里填的 `globalResourceRootPath` 传入。
//! - 导入时支持把 jpg/png/jpeg 转成 tga（由 `convertToBlp` 开关触发，历史字段名保留），
//!   其余格式（blp/tga/bmp）保持原样拷贝。
//! - BLP 编解码仅用于预览解码（blp -> png data url）。

use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use base64::Engine as _;
use base64::engine::general_purpose::STANDARD as B64;
use image::ImageOutputFormat;
use image_blp::convert::blp_to_image;
use image_blp::parser::load_blp;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

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

/// 导入进度事件 payload（事件名 `global-resource-import/progress`）。
///
/// - 导入启动后先发一条 `phase="begin"`（带 `total`）；
/// - 每个源文件处理开始时发 `phase="item-start"`；
/// - 处理结束发 `phase="item-done"`（成功）或 `phase="item-error"`（带 `message`）。
/// - 整个批次结束时发 `phase="end"`。
/// 前端通过事件监听就能实时驱动进度条和当前处理项。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportProgress {
    pub phase: String,
    pub index: usize,
    pub total: usize,
    pub source: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

const IMPORT_PROGRESS_EVENT: &str = "global-resource-import/progress";

fn emit_progress(app: &AppHandle, p: ImportProgress) {
    // 前端订阅不到也不算错（例如首次启动/对话框没挂载）——直接吞掉。
    let _ = app.emit(IMPORT_PROGRESS_EVENT, p);
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

/// TGA 编码：把 jpg/png/jpeg 转成 tga。
fn encode_tga(img: image::DynamicImage, dst: &Path) -> Result<(), String> {
    img.save_with_format(dst, image::ImageFormat::Tga)
        .map_err(|e| format!("TGA 写入失败: {e}"))?;
    Ok(())
}

fn le_u32_at(bytes: &[u8], offset: usize) -> Option<u32> {
    let end = offset.checked_add(4)?;
    let s = bytes.get(offset..end)?;
    Some(u32::from_le_bytes([s[0], s[1], s[2], s[3]]))
}

fn bit_val(alpha: &[u8], bits: u32, index: usize) -> u8 {
    match bits {
        1 => {
            let b = alpha.get(index / 8).copied().unwrap_or(0);
            (b >> (7 - (index % 8))) & 1
        }
        4 => {
            let b = alpha.get(index / 2).copied().unwrap_or(0);
            if index % 2 == 0 {
                (b >> 4) & 0x0f
            } else {
                b & 0x0f
            }
        }
        8 => alpha.get(index).copied().unwrap_or(0),
        _ => 0,
    }
}

/// 针对旧/非标准 BLP1 Direct 文件的宽松解码：
/// 当 mipmap[0] 头信息不合法时，尝试选择第一个在文件边界内的 mip 作为预览图。
fn decode_blp1_direct_lenient(path: &Path) -> Result<image::DynamicImage, String> {
    let bytes = fs::read(path).map_err(|e| format!("读取 BLP 文件失败: {e}"))?;
    if bytes.len() < 1180 {
        return Err("BLP 文件过小（非有效 BLP1）".to_string());
    }
    if bytes.get(0..4) != Some(b"BLP1") {
        return Err("仅支持 BLP1 宽松解码".to_string());
    }

    let content = le_u32_at(&bytes, 4).ok_or_else(|| "BLP 头损坏（content）".to_string())?;
    if content != 1 {
        return Err("宽松解码仅处理 BLP1 Direct 内容".to_string());
    }

    let mut alpha_bits = le_u32_at(&bytes, 8).ok_or_else(|| "BLP 头损坏（alpha）".to_string())?;
    if alpha_bits != 0 && alpha_bits != 1 && alpha_bits != 4 && alpha_bits != 8 {
        alpha_bits = 0;
    }
    let width = le_u32_at(&bytes, 12).ok_or_else(|| "BLP 头损坏（width）".to_string())?;
    let height = le_u32_at(&bytes, 16).ok_or_else(|| "BLP 头损坏（height）".to_string())?;
    if width == 0 || height == 0 {
        return Err("BLP 尺寸非法".to_string());
    }

    let palette = bytes
        .get(156..(156 + 256 * 4))
        .ok_or_else(|| "BLP 调色板越界".to_string())?;

    let mut chosen: Option<(u32, u32, usize)> = None;
    for i in 0..16usize {
        let off = le_u32_at(&bytes, (7 + i) * 4).unwrap_or(0) as usize;
        let size = le_u32_at(&bytes, (23 + i) * 4).unwrap_or(0) as usize;
        if off == 0 || size == 0 {
            continue;
        }
        let w = std::cmp::max(1, width >> i);
        let h = std::cmp::max(1, height >> i);
        let pix = (w as usize).saturating_mul(h as usize);
        let alpha_bytes = if alpha_bits == 0 {
            0usize
        } else {
            (pix.saturating_mul(alpha_bits as usize).saturating_add(7)) / 8
        };
        let min_need = pix.saturating_add(alpha_bytes);
        if off.saturating_add(min_need) <= bytes.len() {
            chosen = Some((w, h, off));
            break;
        }
    }

    let (w, h, off) = chosen.ok_or_else(|| "找不到可用 mip 数据".to_string())?;
    let pix = (w as usize).saturating_mul(h as usize);
    let alpha_bytes = if alpha_bits == 0 {
        0usize
    } else {
        (pix.saturating_mul(alpha_bits as usize).saturating_add(7)) / 8
    };

    let idx = bytes
        .get(off..off.saturating_add(pix))
        .ok_or_else(|| "像素索引区越界".to_string())?;
    let alpha = bytes
        .get(off.saturating_add(pix)..off.saturating_add(pix).saturating_add(alpha_bytes))
        .unwrap_or(&[]);

    let mut rgba = vec![0u8; pix.saturating_mul(4)];
    let alpha_scale = if alpha_bits == 0 {
        0.0f32
    } else {
        255.0f32 / (((1u32 << alpha_bits) - 1) as f32)
    };

    for i in 0..pix {
        let p = (idx[i] as usize).saturating_mul(4);
        let d = i.saturating_mul(4);
        // BLP 调色板是 BGRA 顺序
        rgba[d] = palette.get(p + 2).copied().unwrap_or(0);
        rgba[d + 1] = palette.get(p + 1).copied().unwrap_or(0);
        rgba[d + 2] = palette.get(p).copied().unwrap_or(0);
        rgba[d + 3] = if alpha_bits == 0 {
            255
        } else {
            ((bit_val(alpha, alpha_bits, i) as f32) * alpha_scale).round().clamp(0.0, 255.0) as u8
        };
    }

    let img = image::RgbaImage::from_raw(w, h, rgba)
        .ok_or_else(|| "构建 RGBA 图像失败".to_string())?;
    Ok(image::DynamicImage::ImageRgba8(img))
}

/// BLP 解码为 image::DynamicImage（取 0 级 mipmap）。
fn decode_blp_image(path: &Path) -> Result<image::DynamicImage, String> {
    // 对 BLP1 Direct 先走宽松分支，避免 image_blp 在异常 mipmap 表上刷大量 ERROR 日志。
    if let Ok(bytes) = fs::read(path) {
        if bytes.get(0..4) == Some(b"BLP1") {
            if let Some(content) = le_u32_at(&bytes, 4) {
                if content == 1 {
                    return decode_blp1_direct_lenient(path);
                }
            }
        }
    }

    let strict = match load_blp(path) {
        Ok(blp) => blp_to_image(&blp, 0).map_err(|e| format!("BLP 转换失败: {e}")),
        Err(e) => Err(format!("BLP 读取失败: {e}")),
    };
    match strict {
        Ok(img) => Ok(img),
        Err(strict_err) => match decode_blp1_direct_lenient(path) {
            Ok(img) => {
                log::warn!(
                    "[ui-designer] BLP 严格解码失败，已回退宽松解码: {} ; err={}",
                    path.display(),
                    strict_err
                );
                Ok(img)
            }
            Err(fallback_err) => Err(format!(
                "{}；宽松解码也失败: {}",
                strict_err, fallback_err
            )),
        },
    }
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

/// 哪些源扩展可以转成 TGA？
/// 仅转 png/jpg/jpeg；blp/tga/bmp 保持原样。
fn is_convertible_to_tga(ext: &str) -> bool {
    matches!(ext, "png" | "jpg" | "jpeg")
}

#[tauri::command]
pub async fn global_resource_import(app: AppHandle, req: ImportRequest) -> ImportResult {
    // 全部重活扔到 blocking 线程：`image::open` + BLP 编码是 CPU 密集型，
    // 放在 async 事件循环里会阻塞 IPC，前端表现为 UI 卡死。
    let handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || do_import(handle, req))
        .await
        .unwrap_or_else(|e| ImportResult {
            entries: Vec::new(),
            warnings: vec![ImportWarning {
                source: String::new(),
                message: format!("导入线程异常退出: {e}"),
            }],
        })
}

fn do_import(app: AppHandle, req: ImportRequest) -> ImportResult {
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

    let total = expanded.len();
    emit_progress(
        &app,
        ImportProgress {
            phase: "begin".into(),
            index: 0,
            total,
            source: String::new(),
            message: None,
        },
    );

    for (idx, (src, extra_sub)) in expanded.iter().enumerate() {
        let src_raw_display = src.to_string_lossy().to_string();
        emit_progress(
            &app,
            ImportProgress {
                phase: "item-start".into(),
                index: idx,
                total,
                source: src_raw_display.clone(),
                message: None,
            },
        );

        let src_ext = ext_of(src);
        if !is_image_ext(&src_ext) {
            let msg = format!("不支持的扩展名: .{src_ext}");
            result.warnings.push(ImportWarning {
                source: src_raw_display.clone(),
                message: msg.clone(),
            });
            emit_progress(
                &app,
                ImportProgress {
                    phase: "item-error".into(),
                    index: idx,
                    total,
                    source: src_raw_display.clone(),
                    message: Some(msg),
                },
            );
            continue;
        }

        let stem = src
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("image")
            .to_string();

        // 决定目标扩展名：仅 jpg/png/jpeg 转成 tga；其他格式保持原样。
        let want_convert = req.convert_to_blp && is_convertible_to_tga(src_ext.as_str());
        let target_ext = if want_convert { "tga" } else { src_ext.as_str() };

        // 按"被展开的目录层级"决定最终目标目录。
        let this_dst_dir = if extra_sub.is_empty() {
            dst_dir.clone()
        } else {
            dst_dir.join(extra_sub.replace('\\', std::path::MAIN_SEPARATOR_STR))
        };
        if !this_dst_dir.exists() {
            if let Err(e) = fs::create_dir_all(&this_dst_dir) {
                let msg = format!("创建子目录失败: {e}");
                result.warnings.push(ImportWarning {
                    source: src_raw_display.clone(),
                    message: msg.clone(),
                });
                emit_progress(
                    &app,
                    ImportProgress {
                        phase: "item-error".into(),
                        index: idx,
                        total,
                        source: src_raw_display.clone(),
                        message: Some(msg),
                    },
                );
                continue;
            }
        }
        let target = resolve_target(&this_dst_dir, &stem, target_ext, req.overwrite);

        let outcome = if want_convert {
            // 转换路径：load → encode TGA → 写入；失败时降级为原样拷贝。
            match image::open(src).map_err(|e| format!("加载图片失败: {e}")) {
                Ok(img) => {
                    if let Err(e) = encode_tga(img, &target) {
                        result.warnings.push(ImportWarning {
                            source: src_raw_display.clone(),
                            message: format!("转换 TGA 失败，已降级为直接拷贝原文件：{e}"),
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

        match outcome {
            Some(abs) => {
                if let Some(entry) = to_entry(&root, &abs) {
                    result.entries.push(entry);
                }
                emit_progress(
                    &app,
                    ImportProgress {
                        phase: "item-done".into(),
                        index: idx,
                        total,
                        source: src_raw_display,
                        message: None,
                    },
                );
            }
            None => {
                emit_progress(
                    &app,
                    ImportProgress {
                        phase: "item-error".into(),
                        index: idx,
                        total,
                        source: src_raw_display,
                        message: Some("处理失败".into()),
                    },
                );
            }
        }
    }

    emit_progress(
        &app,
        ImportProgress {
            phase: "end".into(),
            index: total,
            total,
            source: String::new(),
            message: None,
        },
    );

    result
}

/// 从全局库彻底删除一条路径（文件或目录）。
///
/// 策略：**硬删除**——直接走 `fs::remove_file` / `fs::remove_dir_all`，不再挪去 `.trash`。
/// 老版本曾经留过 `.trash/<timestamp>/<name>` 的软删除目录做防手滑兜底，但会无限累积
/// 磁盘占用、又没有自动清理入口，用户体验更差。现在删除即释放。
///
/// 兼容清理：如果根目录下还残留着老版本写入的 `.trash` 目录，这个命令也会顺手把它
/// 整个干掉（只在它看起来确实是老遗留时才动——顶层只能含 "数字时间戳命名" 的子目录）。
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
        // 目标已经不存在，也顺手把老版本留下的 .trash 清掉
        let _ = purge_legacy_trash(&root);
        return Ok(());
    }

    let removed = if abs.is_dir() {
        fs::remove_dir_all(&abs).map_err(|e| format!("删除目录失败: {e}"))
    } else {
        fs::remove_file(&abs).map_err(|e| format!("删除文件失败: {e}"))
    };
    let result = removed.map(|_| ());

    // 即便本次删除没事，也顺手把残留的老 .trash 清掉，保证迁移到新策略后全局库干净。
    let _ = purge_legacy_trash(&root);

    result
}

/// 扫一眼根目录下的 `.trash`：如果存在且仅由"老版本的时间戳子目录"组成就整个删掉。
/// 保守起见，遇到无法识别的内容就停手不动，避免误删用户自己放在同名目录里的东西。
fn purge_legacy_trash(root: &Path) -> std::io::Result<()> {
    let trash = root.join(".trash");
    if !trash.is_dir() {
        return Ok(());
    }
    // 校验：里面要么为空，要么只有数字命名的子目录（老版本 `ts.to_string()` 的格式）。
    let mut all_look_like_legacy = true;
    for entry in fs::read_dir(&trash)? {
        let entry = entry?;
        let name = entry.file_name();
        let name_str = name.to_string_lossy();
        let is_numeric_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false)
            && !name_str.is_empty()
            && name_str.chars().all(|c| c.is_ascii_digit());
        if !is_numeric_dir {
            all_look_like_legacy = false;
            break;
        }
    }
    if all_look_like_legacy {
        // 整个删掉；失败就保留，让用户自己处理。
        fs::remove_dir_all(&trash)?;
    }
    Ok(())
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

/// 将 TGA（含压缩/RLE）解码为 PNG 的 base64 data URL。
#[tauri::command]
pub fn tga_decode_to_png_base64(abs_path: String) -> Result<String, String> {
    let p = PathBuf::from(&abs_path);
    if !p.is_file() {
        return Err("TGA 文件不存在".to_string());
    }
    let img = image::open(&p).map_err(|e| format!("TGA 解码失败: {e}"))?;
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

/// 把一个文件拷贝到任意绝对路径（会自动 `mkdir -p` 目标父目录）。
///
/// 专为"导出时把全局库里的资源拷到目标项目 `resource/` 子目录"设计——
/// 目标路径可能跨盘、可能不在 `fs:scope` 白名单里，所以用 `std::fs::copy` 直接做。
///
/// - `overwrite = false` 时，若目标存在则直接成功返回（幂等，返回源文件大小）。
/// - 返回值是本次写入的字节数（`fs::copy` 的返回），或原文件大小（跳过时）。
#[tauri::command]
pub fn copy_file_abs(src: String, dst: String, overwrite: bool) -> Result<u64, String> {
    let src_p = PathBuf::from(&src);
    let dst_p = PathBuf::from(&dst);
    if !src_p.is_file() {
        return Err(format!("源文件不存在或不是文件: {}", src));
    }
    if dst_p.exists() && !overwrite {
        let size = fs::metadata(&src_p).map(|m| m.len()).unwrap_or(0);
        return Ok(size);
    }
    if let Some(parent) = dst_p.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("创建目标目录失败: {e}"))?;
        }
    }
    fs::copy(&src_p, &dst_p).map_err(|e| format!("拷贝失败 {} -> {}: {e}", src, dst))
}
