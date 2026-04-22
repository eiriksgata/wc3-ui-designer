import { ref, computed, watch, type Ref } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { ImageResource } from '../types';

/**
 * 全局资源库（跨项目共享，路径由用户在"设置"里配置）。
 *
 * 设计约束：
 * - 所有磁盘 IO 通过 `invoke` 调后端 Rust command，**不**经 `@tauri-apps/plugin-fs`，
 *   用户可以把库放到任意盘符而不受 `fs:scope` 白名单限制。
 * - `root` 为空字符串时表示"尚未配置"，所有写入操作都应被 UI 禁用。
 * - 预览 URL 生成策略：
 *   - blp/tga → `invoke('*_decode_to_png_base64')`，由 Rust 统一转 PNG data URL
 *   - 其他    → `invoke('read_file_as_base64')` 生成 dataURL
 *
 * schema 2.0.0 起，项目不再维护 `imageResources` 登记表——widget 直接引用绝对路径。
 * 所以本 composable 也不再提供 `useInProject / hydrate / cascade` 这类登记辅助函数。
 */

export interface GlobalResourceEntry {
    name: string;
    relPath: string;
    absPath: string;
    size: number;
    mtimeMs: number;
    ext: string;
}

export interface SetRootResult {
    ok: boolean;
    normalizedPath: string;
    writable: boolean;
    created: boolean;
    message: string;
}

export interface ImportWarning {
    source: string;
    message: string;
}

export interface ImportResult {
    entries: GlobalResourceEntry[];
    warnings: ImportWarning[];
}

export interface MigrateResult {
    movedCount: number;
    totalBytes: number;
    warnings: ImportWarning[];
}

/** 后端 `global_resource_import` 在处理每个文件前后会 emit 的事件 payload。 */
export interface ImportProgressEvent {
    /** 'begin' | 'item-start' | 'item-done' | 'item-error' | 'end' */
    phase: string;
    index: number;
    total: number;
    source: string;
    message?: string;
}

/** 前端订阅用的事件名（与 Rust `IMPORT_PROGRESS_EVENT` 保持一致）。 */
export const IMPORT_PROGRESS_EVENT = 'global-resource-import/progress';

const mimeForExt = (ext: string): string => {
    switch (ext.toLowerCase()) {
        case 'png': return 'image/png';
        case 'jpg':
        case 'jpeg': return 'image/jpeg';
        case 'bmp': return 'image/bmp';
        case 'gif': return 'image/gif';
        case 'webp': return 'image/webp';
        default: return 'application/octet-stream';
    }
};

export function usePreviewResolver() {
    const cache = new Map<string, string>();
    const inflight = new Map<string, Promise<string>>();
    const failedLogged = new Set<string>();

    const resolve = async (absPath: string, ext: string): Promise<string> => {
        if (!absPath) return '';
        if (cache.has(absPath)) return cache.get(absPath)!;
        const running = inflight.get(absPath);
        if (running) return running;

        const task = (async () => {
            try {
                const lower = (ext || '').toLowerCase();
                if (lower === 'blp') {
                    const url = await invoke<string>('blp_decode_to_png_base64', { absPath });
                    return url;
                }
                if (lower === 'tga') {
                    const url = await invoke<string>('tga_decode_to_png_base64', { absPath });
                    return url;
                }
                if (['png', 'jpg', 'jpeg', 'bmp', 'gif', 'webp'].includes(lower)) {
                    const b64 = await invoke<string>('read_file_as_base64', { absPath });
                    return `data:${mimeForExt(lower)};base64,${b64}`;
                }
                return '';
            } catch (e) {
                if (import.meta.env.DEV && !failedLogged.has(absPath)) {
                    failedLogged.add(absPath);
                    console.warn('[globalLib] 生成预览失败：', absPath, e);
                }
                return '';
            }
        })();

        inflight.set(absPath, task);
        const url = await task;
        inflight.delete(absPath);
        if (url) cache.set(absPath, url);
        return url;
    };

    const invalidate = (absPath?: string) => {
        if (absPath) cache.delete(absPath);
        else cache.clear();
    };

    return { resolve, invalidate };
}

/** 反斜杠归一化 + 去前导分隔符，保证 relPath 在全仓上下文里有单一形态。 */
export function normalizeGlobalRelPath(rel: string): string {
    return (rel || '').replace(/\//g, '\\').replace(/^\\+/, '');
}

/** 把全局库相对路径拼成当前机器上的绝对路径。root 为空时返回空串。 */
export function buildLocalPathFromRel(root: string, rel: string): string {
    if (!root || !rel) return '';
    const normRoot = root.replace(/[\\/]+$/, '');
    const normRel = normalizeGlobalRelPath(rel);
    return `${normRoot}\\${normRel}`;
}

export function useGlobalResourceLibrary(
    root: Ref<string>,
    message: Ref<string>,
) {
    const entries = ref<GlobalResourceEntry[]>([]);
    const warnings = ref<ImportWarning[]>([]);
    const loading = ref(false);
    const { resolve: resolvePreview, invalidate: invalidatePreview } = usePreviewResolver();

    /**
     * absPath -> previewUrl 的响应式映射。
     *
     * 之所以单独用一个 ref 而不是挂到 entry 上：`resources` 是 computed，每次
     * entries 或此 map 变化都会重新 map 出新的 ImageResource 对象，保证面板上的
     * 预览图能在 `fillPreviews` 逐个解码完成后"一路跟着更新"。
     */
    const previewMap = ref<Record<string, string>>({});

    /** 后端 entry -> 前端 ImageResource。
     *  - value = 绝对路径（也就是 widget.image 运行时使用的值）
     *  - relPath = 相对全局库根的 relPath（反斜杠风格）
     *  - localPath = 绝对路径（alias；保留给可能引用此字段的旧代码）
     *  - previewUrl = 从 previewMap 动态取；没有就是空串（由面板显示"无预览"占位）
     */
    const toImageResource = (e: GlobalResourceEntry): ImageResource => ({
        label: e.name,
        value: e.absPath,
        relPath: e.relPath,
        localPath: e.absPath,
        previewUrl: previewMap.value[e.absPath] || '',
    });

    const resources = computed<ImageResource[]>(() =>
        entries.value.map((e) => toImageResource(e)),
    );

    const refresh = async () => {
        if (!root.value) {
            entries.value = [];
            previewMap.value = {};
            return;
        }
        loading.value = true;
        try {
            const list = await invoke<GlobalResourceEntry[]>('global_resource_list', {
                root: root.value,
            });
            entries.value = list || [];
            // 清掉那些文件已经不在列表里的旧预览（例如刚被删了的条目）。
            const alive = new Set((list || []).map((x) => x.absPath));
            const next: Record<string, string> = {};
            for (const [k, v] of Object.entries(previewMap.value)) {
                if (alive.has(k)) next[k] = v;
            }
            previewMap.value = next;
            void fillPreviews();
        } catch (e) {
            console.error('[globalLib] list 失败：', e);
            message.value = '读取全局资源库失败';
            entries.value = [];
        } finally {
            loading.value = false;
        }
    };

    const fillPreviews = async () => {
        const snapshot = entries.value.slice();
        for (const entry of snapshot) {
            if (previewMap.value[entry.absPath]) continue; // 已有缓存
            const url = await resolvePreview(entry.absPath, entry.ext);
            if (!url) continue;
            // 直接 splice 一个新对象进去，保证 Vue 能检测到 Record 变化
            previewMap.value = { ...previewMap.value, [entry.absPath]: url };
        }
    };

    /**
     * 当前导入批次的进度状态（由 `global-resource-import/progress` 事件驱动）。
     * - `total` 为 0 表示当前没有正在进行的导入。
     * - `current` 是最近一次 `item-start` 的源路径（显示用）。
     * - `doneCount` 累计 `item-done + item-error` 的数量。
     */
    const importProgress = ref<{
        total: number;
        done: number;
        current: string;
        errors: number;
    }>({
        total: 0,
        done: 0,
        current: '',
        errors: 0,
    });

    const resetImportProgress = () => {
        importProgress.value = { total: 0, done: 0, current: '', errors: 0 };
    };

    const importSources = async (opts: {
        sources: string[];
        subDir?: string;
        convertToBlp?: boolean;
        overwrite?: boolean;
    }): Promise<ImportResult> => {
        if (!root.value) {
            const msg = '请先在设置里配置全局资源库路径';
            message.value = msg;
            return { entries: [], warnings: [{ source: '', message: msg }] };
        }

        resetImportProgress();
        // 订阅后端进度事件——在 invoke 返回前保持监听，随后 unlisten。
        let unlisten: null | (() => void) = null;
        try {
            unlisten = await listen<ImportProgressEvent>(IMPORT_PROGRESS_EVENT, (ev) => {
                const p = ev.payload;
                if (!p) return;
                if (p.phase === 'begin') {
                    importProgress.value = {
                        total: p.total,
                        done: 0,
                        current: '',
                        errors: 0,
                    };
                } else if (p.phase === 'item-start') {
                    importProgress.value = {
                        ...importProgress.value,
                        total: p.total,
                        current: p.source,
                    };
                } else if (p.phase === 'item-done') {
                    importProgress.value = {
                        ...importProgress.value,
                        total: p.total,
                        done: importProgress.value.done + 1,
                    };
                } else if (p.phase === 'item-error') {
                    importProgress.value = {
                        ...importProgress.value,
                        total: p.total,
                        done: importProgress.value.done + 1,
                        errors: importProgress.value.errors + 1,
                    };
                } else if (p.phase === 'end') {
                    importProgress.value = {
                        ...importProgress.value,
                        total: p.total,
                        done: p.total,
                        current: '',
                    };
                }
            });
        } catch (e) {
            // 没拿到事件监听器也不致命，只是没有实时进度。
            console.warn('[globalLib] 无法订阅导入进度事件：', e);
        }

        try {
            const result = await invoke<ImportResult>('global_resource_import', {
                req: {
                    root: root.value,
                    sources: opts.sources,
                    subDir: opts.subDir || '',
                    convertToBlp: !!opts.convertToBlp,
                    overwrite: !!opts.overwrite,
                },
            });
            warnings.value = result.warnings || [];
            await refresh();
            const okCount = (result.entries || []).length;
            const warnCount = (result.warnings || []).length;
            message.value = warnCount
                ? `已导入 ${okCount} 项，${warnCount} 项有告警`
                : `已导入 ${okCount} 项到全局资源库`;
            return result;
        } catch (e: any) {
            console.error('[globalLib] import 失败：', e);
            message.value = '导入全局资源库失败：' + (e?.message || String(e));
            return { entries: [], warnings: [{ source: '', message: String(e) }] };
        } finally {
            try { unlisten && unlisten(); } catch { /* noop */ }
            // 让对话框能最后读到"100%"状态；由调用方在关闭时再重置。
        }
    };

    /** 从全局库硬删除一条路径（文件或目录）。后端会直接 `fs::remove_*` 掉。 */
    const removeEntry = async (relPath: string): Promise<{ ok: boolean }> => {
        if (!root.value) return { ok: false };
        try {
            await invoke('global_resource_delete', { root: root.value, relPath });
            invalidatePreview();
            previewMap.value = {};
            await refresh();
            return { ok: true };
        } catch (e: any) {
            console.error('[globalLib] delete 失败：', e);
            message.value = '删除失败：' + (e?.message || String(e));
            return { ok: false };
        }
    };

    const setRoot = async (newRoot: string): Promise<SetRootResult> => {
        try {
            const res = await invoke<SetRootResult>('global_resource_set_root', {
                root: newRoot,
            });
            return res;
        } catch (e: any) {
            return {
                ok: false,
                normalizedPath: newRoot,
                writable: false,
                created: false,
                message: e?.message || String(e),
            };
        }
    };

    const migrate = async (
        oldRoot: string,
        newRoot: string,
        mode: 'move' | 'copy',
    ): Promise<MigrateResult> => {
        try {
            return await invoke<MigrateResult>('global_resource_migrate', {
                oldRoot,
                newRoot,
                mode,
            });
        } catch (e: any) {
            return {
                movedCount: 0,
                totalBytes: 0,
                warnings: [{ source: '', message: e?.message || String(e) }],
            };
        }
    };

    const getDiskFree = async (path: string): Promise<number> => {
        try {
            return await invoke<number>('disk_free_space', { path });
        } catch {
            return 0;
        }
    };

    const pathExists = async (path: string): Promise<boolean> => {
        try {
            return await invoke<boolean>('path_exists', { path });
        } catch {
            return false;
        }
    };

    watch(
        root,
        () => {
            invalidatePreview();
            previewMap.value = {};
            void refresh();
        },
        { immediate: true },
    );

    return {
        entries,
        resources,
        warnings,
        loading,
        importProgress,
        resetImportProgress,
        refresh,
        importSources,
        removeEntry,
        setRoot,
        migrate,
        getDiskFree,
        pathExists,
        resolvePreview,
        invalidatePreview,
    };
}
