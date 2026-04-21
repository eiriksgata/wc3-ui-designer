import { ref, computed, watch, type Ref } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import type { ImageResource } from '../types';
import { decodeTgaToDataUrl } from '../utils/tgaDecoder';

/**
 * 全局资源库（跨项目共享，路径由用户在"设置"里配置）。
 *
 * 设计约束：
 * - 所有磁盘 IO 都通过 `invoke` 调后端 Rust command，**不**经 `@tauri-apps/plugin-fs`，
 *   用户可以把库放到任意盘符而不受 `fs:scope` 白名单限制。
 * - `root` 为空字符串时表示"尚未配置"，所有写入操作都应被 UI 禁用。
 * - 预览 URL 生成策略：
 *   - blp    → `invoke('blp_decode_to_png_base64')`，返回 PNG dataURL
 *   - tga    → 前端 `decodeTgaToDataUrl`（复用既有工具）
 *   - 其他   → `invoke('read_file_as_base64')` 生成 `data:image/<ext>;base64,...` dataURL，
 *             避免依赖 `convertFileSrc` / `fs:scope`（因为库可能在 D: 等非白名单目录）。
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

/**
 * 为任意全局库条目生成 previewUrl；优先使用缓存，避免重复解码。
 */
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
        if (absPath) {
            cache.delete(absPath);
        } else {
            cache.clear();
        }
    };

    return { resolve, invalidate };
}

/**
 * 使用前端 "war3mapImported\\" 前缀 + 全局库相对路径拼出项目侧的资源 value。
 * 这样全局库里的 `icons/gold.blp` 最终落到项目里就是 `war3mapImported\\icons\\gold.blp`，
 * 和 wc3-map-ts-template 的资源契约一致，也能被 `ui_normalize_resource_paths` 识别。
 */
const WAR3_IMPORTED_PREFIX = 'war3mapImported\\';

export function toProjectValueFromGlobalRel(relPath: string): string {
    const rel = (relPath || '').replace(/\//g, '\\').replace(/^\\+/, '');
    return WAR3_IMPORTED_PREFIX + rel;
}

/**
 * 反斜杠归一化 + 去前导分隔符，保证 `globalRelPath` 在全仓上下文里有单一形态。
 */
export function normalizeGlobalRelPath(rel: string): string {
    return (rel || '').replace(/\//g, '\\').replace(/^\\+/, '');
}

/**
 * 把全局库相对路径拼成当前机器上的绝对路径。root 为空时返回空串，
 * 调用方应把结果同时写进 `ImageResource.localPath`（或视为 missing）。
 *
 * 只服务于 Windows 桌面端（WC3 主场景），直接用反斜杠拼。
 */
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

    /** 将后端 entry 转成面向 UI 的 ImageResource（全局 Tab 行）。
     *  全局库条目里，`globalRelPath === value === relPath`——但项目 Tab 不同，
     *  项目里 value 是 `war3mapImported\\<rel>`，见 `useInProject`。 */
    const toImageResource = (e: GlobalResourceEntry): ImageResource => ({
        label: e.name,
        globalRelPath: e.relPath,
        value: e.relPath,
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

    /** 异步补齐所有条目的 previewUrl；不会阻塞 UI。 */
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

    /** 触发后端导入。自动刷新列表。 */
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

    /**
     * 软删除全局库条目，并**级联**把项目里所有 `globalRelPath === relPath`
     * 的引用标记为 missing（清空 localPath/previewUrl，但保留条目，让用户
     * 之后可以手动重新导入替换，或自己决定是否"移除引用"）。
     *
     * 传 `projectResources` 表示希望级联；不传就只动全局库。
     */
    const removeEntry = async (
        relPath: string,
        projectResources?: Ref<ImageResource[]>,
    ): Promise<{ ok: boolean; affected: number }> => {
        if (!root.value) return { ok: false, affected: 0 };
        try {
            await invoke('global_resource_delete', { root: root.value, relPath });
            invalidatePreview();
            const affected = projectResources
                ? markProjectRefsMissing(projectResources, relPath)
                : 0;
            await refresh();
            return { ok: true, affected };
        } catch (e: any) {
            console.error('[globalLib] delete 失败：', e);
            message.value = '删除失败：' + (e?.message || String(e));
            return { ok: false, affected: 0 };
        }
    };

    /** 把项目资源列表中命中 relPath 的条目标记为 missing；返回受影响条数。 */
    const markProjectRefsMissing = (
        projectResources: Ref<ImageResource[]>,
        relPath: string,
    ): number => {
        const key = normalizeGlobalRelPath(relPath);
        let n = 0;
        const next = projectResources.value.map((r) => {
            if (normalizeGlobalRelPath(r.globalRelPath || '') === key) {
                n += 1;
                return { ...r, localPath: undefined, previewUrl: '', missing: true };
            }
            return r;
        });
        if (n > 0) projectResources.value = next;
        return n;
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

    /**
     * 把全局库条目"引用"到项目资源里：不做任何磁盘拷贝，只登记 ImageResource。
     * 新模型下 `globalRelPath` 是唯一身份；value 走 `war3mapImported\\<rel>`，
     * localPath 指向全局库的绝对路径（用于预览/导出）。去重 key 统一为 globalRelPath。
     */
    const useInProject = (
        res: ImageResource,
        projectResources: Ref<ImageResource[]>,
    ): ImageResource => {
        // 兼容两种入参：
        //  - 全局 Tab 的行（globalRelPath 与 value 同值，都是 relPath）
        //  - 调用方手工拼的 { globalRelPath, ... }
        const rel = normalizeGlobalRelPath(res.globalRelPath || res.value || '');
        const value = toProjectValueFromGlobalRel(rel);
        const localPath =
            res.localPath || buildLocalPathFromRel(root.value, rel) || undefined;

        const existing = projectResources.value.find(
            (r) => normalizeGlobalRelPath(r.globalRelPath || '') === rel,
        );
        if (existing) {
            existing.localPath = localPath;
            existing.value = value;
            existing.missing = !localPath ? true : existing.missing;
            if (res.previewUrl) existing.previewUrl = res.previewUrl;
            return existing;
        }
        const entry: ImageResource = {
            label: res.label,
            globalRelPath: rel,
            value,
            localPath,
            previewUrl: res.previewUrl || '',
            missing: !localPath,
        };
        projectResources.value = [...projectResources.value, entry];
        return entry;
    };

    /**
     * 一站式：把外部文件导入全局库 + 立即登记为项目引用（去重）。
     * 返回导入结果（可用于展示告警）。项目 Tab 的"导入资源"应直接调用这个。
     */
    const importAndRefInProject = async (
        opts: {
            sources: string[];
            subDir?: string;
            convertToBlp?: boolean;
            overwrite?: boolean;
        },
        projectResources: Ref<ImageResource[]>,
    ): Promise<ImportResult> => {
        const result = await importSources(opts);
        for (const e of result.entries || []) {
            // 直接用后端返回的 entry，不依赖前端 list 刷新时机。
            useInProject(toImageResource(e), projectResources);
        }
        // 补预览（BLP/TGA/普通图），异步，不阻塞返回。
        void fillProjectPreviews(projectResources);
        return result;
    };

    /**
     * 给项目资源列表里还没 previewUrl 的条目刷一遍预览。
     * 专供载入 / 导入后调用；不会触碰已经有 previewUrl 的条目，避免闪烁。
     */
    const fillProjectPreviews = async (
        projectResources: Ref<ImageResource[]>,
    ) => {
        const snapshot = projectResources.value.slice();
        for (const r of snapshot) {
            if (r.missing) continue;
            if (r.previewUrl) continue;
            const abs = r.localPath;
            if (!abs) continue;
            const ext = (r.label.split('.').pop() || '').toLowerCase();
            const url = await resolvePreview(abs, ext);
            if (!url) continue;
            const cur = projectResources.value.find(
                (x) => normalizeGlobalRelPath(x.globalRelPath || '') ===
                    normalizeGlobalRelPath(r.globalRelPath || ''),
            );
            if (cur) cur.previewUrl = url;
        }
    };

    /**
     * 载入 .uiproj 之后用：把磁盘上只有 `{label, globalRelPath, value}`
     * 的原始条目，补齐 `localPath` / `missing` 字段；不做预览（交给 fillProjectPreviews）。
     */
    const hydrateProjectRefs = async (
        raw: Array<{ label: string; globalRelPath: string; value?: string }>,
    ): Promise<ImageResource[]> => {
        const out: ImageResource[] = [];
        for (const r of raw) {
            const rel = normalizeGlobalRelPath(r.globalRelPath || '');
            const value = r.value || toProjectValueFromGlobalRel(rel);
            const abs = buildLocalPathFromRel(root.value, rel);
            let missing = !abs;
            if (abs) {
                try {
                    const exists = await invoke<boolean>('path_exists', { path: abs });
                    missing = !exists;
                } catch {
                    missing = true;
                }
            }
            out.push({
                label: r.label,
                globalRelPath: rel,
                value,
                localPath: missing ? undefined : abs,
                previewUrl: '',
                missing,
            });
        }
        return out;
    };

    // 路径变化时自动重扫
    watch(
        root,
        () => {
            invalidatePreview();
            void refresh();
        },
        { immediate: true },
    );

    return {
        // State
        entries,
        resources,
        warnings,
        loading,
        // Ops
        refresh,
        importSources,
        removeEntry,
        setRoot,
        migrate,
        getDiskFree,
        pathExists,
        useInProject,
        importAndRefInProject,
        hydrateProjectRefs,
        fillProjectPreviews,
        markProjectRefsMissing,
        // Preview helpers（供 useResourceManager 复用）
        resolvePreview,
        invalidatePreview,
    };
}
