import { ref, computed, watch, type Ref } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import type { ImageResource } from '../types';
import { decodeTgaToDataUrl } from '../utils/tgaDecoder';

/**
 * 全局资源库（跨项目共享，路径由用户在"设置"里配置）。
 *
 * 设计约束：
 * - 所有磁盘 IO 通过 `invoke` 调后端 Rust command，**不**经 `@tauri-apps/plugin-fs`，
 *   用户可以把库放到任意盘符而不受 `fs:scope` 白名单限制。
 * - `root` 为空字符串时表示"尚未配置"，所有写入操作都应被 UI 禁用。
 * - 预览 URL 生成策略：
 *   - blp    → `invoke('blp_decode_to_png_base64')`
 *   - tga    → 前端 `decodeTgaToDataUrl`
 *   - 其他   → `invoke('read_file_as_base64')` 生成 dataURL
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
                    const b64 = await invoke<string>('read_file_as_base64', { absPath });
                    const bin = atob(b64);
                    const bytes = new Uint8Array(bin.length);
                    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
                    const blob = new Blob([bytes], { type: 'application/octet-stream' });
                    return await decodeTgaToDataUrl(blob);
                }
                if (['png', 'jpg', 'jpeg', 'bmp', 'gif', 'webp'].includes(lower)) {
                    const b64 = await invoke<string>('read_file_as_base64', { absPath });
                    return `data:${mimeForExt(lower)};base64,${b64}`;
                }
                return '';
            } catch (e) {
                console.warn('[globalLib] 生成预览失败：', absPath, e);
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

    /** 后端 entry -> 前端 ImageResource。
     *  - value = 绝对路径（也就是 widget.image 运行时使用的值）
     *  - relPath = 相对全局库根的 relPath（反斜杠风格）
     *  - localPath = 绝对路径（alias；保留给可能引用此字段的旧代码）
     */
    const toImageResource = (e: GlobalResourceEntry): ImageResource => ({
        label: e.name,
        value: e.absPath,
        relPath: e.relPath,
        localPath: e.absPath,
        previewUrl: '',
    });

    const resources = computed<ImageResource[]>(() =>
        entries.value.map((e) => toImageResource(e)),
    );

    const refresh = async () => {
        if (!root.value) {
            entries.value = [];
            return;
        }
        loading.value = true;
        try {
            const list = await invoke<GlobalResourceEntry[]>('global_resource_list', {
                root: root.value,
            });
            entries.value = list || [];
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
            const url = await resolvePreview(entry.absPath, entry.ext);
            const cur = entries.value.find((x) => x.absPath === entry.absPath);
            if (cur) {
                (cur as any).previewUrl = url;
            }
        }
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
        }
    };

    /** 软删除一条全局库文件（会被搬去 .trash 目录，后端处理）。 */
    const removeEntry = async (relPath: string): Promise<{ ok: boolean }> => {
        if (!root.value) return { ok: false };
        try {
            await invoke('global_resource_delete', { root: root.value, relPath });
            invalidatePreview();
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
            void refresh();
        },
        { immediate: true },
    );

    return {
        entries,
        resources,
        warnings,
        loading,
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
