import { ref, type Ref, type ComputedRef } from 'vue';
import { open as tauriOpen } from '@tauri-apps/plugin-dialog';
import { readFile, readDir } from '@tauri-apps/plugin-fs';
import { invoke } from '@tauri-apps/api/core';
import { decodeTgaToDataUrl } from '../utils/tgaDecoder';
import type { ImageResource, Widget } from '../types';

/**
 * useResourceManager（schema 2.0.0 版）
 * ------------------------------------
 * 职责被严格缩到：
 *  1. 面板 UI 状态（拖拽高亮、悬浮预览、grid/panel ref）
 *  2. "收集"用户选择/拖入的**绝对路径**
 *  3. 对 `imageResources` 中的条目按其 `localPath` 刷新预览
 *
 * **不再**自己往 `imageResources` 里 push 条目——项目资源必须经过全局库
 * 流水线（App.vue 会在拿到路径后弹 ImportResourceDialog 并落到全局库 +
 * 注册为项目引用）。这样避免出现没有 `globalRelPath` 的野条目。
 */

const ALLOWED_EXTS = ['blp', 'png', 'tga', 'bmp', 'jpg', 'jpeg'];

// 从绝对路径生成 BLP 的 PNG dataURL 预览；失败时返回空串。
async function blpPathToDataUrl(absPath: string): Promise<string> {
    if (!absPath) return '';
    try {
        return await invoke<string>('blp_decode_to_png_base64', { absPath });
    } catch (e) {
        console.warn('BLP 解码失败（预览将留空）：', absPath, e);
        return '';
    }
}

export function useResourceManager(
    imageResources: Ref<ImageResource[]>,
    message: Ref<string>,
    selectedWidget: ComputedRef<Widget | null>,
    uiZoom: Ref<number>
) {
    // Refs
    const resourcesGridRef = ref<HTMLElement | null>(null);
    const resourcesPanelRef = ref<HTMLElement | null>(null);
    const isResourcesDragOver = ref(false);
    const hoverPreview = ref<{
        visible: boolean;
        x: number;
        y: number;
        res: ImageResource | null;
    }>({
        visible: false,
        x: 0,
        y: 0,
        res: null,
    });

    // ================== 工具 ==================

    const isAllowedExt = (ext: string) => ALLOWED_EXTS.includes(ext.toLowerCase());

    const extOf = (p: string) => (p.split('.').pop() || '').toLowerCase();

    /** 递归枚举一个目录下所有合法图片（返回绝对路径数组）。 */
    const listImagesRecursive = async (dirPath: string): Promise<string[]> => {
        const out: string[] = [];
        try {
            const entries = await readDir(dirPath);
            for (const entry of entries) {
                const fullPath =
                    dirPath + (dirPath.endsWith('\\') || dirPath.endsWith('/') ? '' : '\\') + entry.name;
                if (entry.isDirectory) {
                    const sub = await listImagesRecursive(fullPath);
                    out.push(...sub);
                } else if (entry.isFile && isAllowedExt(extOf(entry.name))) {
                    out.push(fullPath);
                }
            }
        } catch (e) {
            console.error('读取文件夹失败:', dirPath, e);
        }
        return out;
    };

    /**
     * 把用户选到/拖入的若干绝对路径（可能包含目录）展开为平铺的文件列表。
     * 目录会被递归展开；目录自身的名字**不会**被拼到返回路径里——
     * 保留目录层级的逻辑交给后端 `global_resource_import`（它接受目录入参后
     * 会自动保留相对结构）。为了让"拖一个文件夹进来" == "拖进来的每个文件单独拖"
     * 这里仍只返回文件级别的路径，让 ImportResourceDialog 把原始路径透传给后端。
     *
     * 但当 path 本身就是目录时，我们**保留原始目录路径**（后端会展开），
     * 避免前端展开后丢失目录名层级。
     */
    const normalizePickedPaths = async (paths: string[]): Promise<string[]> => {
        const out: string[] = [];
        for (const p of paths || []) {
            if (!p) continue;
            const s = String(p);
            try {
                // 是目录 -> 直接把目录本身交给后端，由 Rust 走 walk_collect
                await readDir(s);
                out.push(s);
            } catch {
                // 是文件
                if (isAllowedExt(extOf(s))) {
                    out.push(s);
                }
            }
        }
        return out;
    };

    // ================== 拖拽 UI 状态 ==================

    const onResourcesDragEnter = (ev: DragEvent) => {
        ev.preventDefault();
        ev.stopPropagation();
        isResourcesDragOver.value = true;
    };

    const onResourcesDragOver = (ev: DragEvent) => {
        ev.preventDefault();
        ev.stopPropagation();
        isResourcesDragOver.value = true;
    };

    const onResourcesDragLeave = (ev: DragEvent) => {
        ev.preventDefault();
        ev.stopPropagation();
        const target = ev.currentTarget as HTMLElement;
        const rect = target.getBoundingClientRect();
        const x = ev.clientX;
        const y = ev.clientY;
        if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
            isResourcesDragOver.value = false;
        }
    };

    // ================== 路径收集（供 App.vue 路由到全局库） ==================

    /** 从浏览器 DragEvent 中收集文件路径；返回绝对路径数组（非绝对的会被忽略并告警）。 */
    const collectWebDropPaths = async (ev: DragEvent): Promise<string[]> => {
        isResourcesDragOver.value = false;
        const dt = ev.dataTransfer;
        if (!dt || !dt.files || dt.files.length === 0) return [];
        const raw: string[] = [];
        for (let i = 0; i < dt.files.length; i++) {
            const f = dt.files[i];
            const p = (f as any).path as string | undefined;
            if (!p) {
                message.value = '浏览器拖拽无法获取绝对路径，请用"导入资源"按钮，或使用 Tauri 原生拖放';
                continue;
            }
            raw.push(p);
        }
        return normalizePickedPaths(raw);
    };

    /** 直接接收 Tauri 原生拖放的路径数组。 */
    const collectTauriDropPaths = async (paths: string[]): Promise<string[]> => {
        isResourcesDragOver.value = false;
        return normalizePickedPaths(paths || []);
    };

    /** 打开 Tauri 文件选择对话框，让用户挑文件（不支持选目录——要选目录请用拖放）。 */
    const pickImportPaths = async (): Promise<string[]> => {
        const selected = await tauriOpen({
            title: '导入资源',
            multiple: true,
            filters: [
                { name: '图片资源', extensions: ALLOWED_EXTS.slice() },
            ],
        });
        if (!selected) return [];
        const arr = Array.isArray(selected) ? selected : [selected];
        return normalizePickedPaths(arr);
    };

    // ================== 预览刷新（基于 localPath） ==================

    /**
     * 根据 `imageResources[*].localPath` 现场重算 previewUrl。
     * 跳过 `missing === true` 或 `localPath` 为空的条目——缺失的文件不应
     * 被展示成"正常"预览。Schema 2.0.0 起 localPath 必然是全局库下的绝对路径。
     */
    const refreshResourcePreviewsFromLocal = async () => {
        const list = imageResources.value || [];
        const tasks = list.map(async (res) => {
            if (res.missing) return;
            if (!res.localPath) return;
            const ext = extOf(res.localPath);
            try {
                if (ext === 'blp') {
                    res.previewUrl = await blpPathToDataUrl(res.localPath);
                    return;
                }
                const data = await readFile(res.localPath);
                const blob = new Blob([data], { type: 'application/octet-stream' });
                if (['png', 'jpg', 'jpeg', 'bmp'].includes(ext)) {
                    res.previewUrl = URL.createObjectURL(blob);
                } else if (ext === 'tga') {
                    res.previewUrl = await decodeTgaToDataUrl(blob);
                } else {
                    res.previewUrl = '';
                }
            } catch (e) {
                // 文件读失败（可能越 fs:scope 或不存在）——标 missing，不展示坏预览。
                console.warn('从本地路径加载资源预览失败:', res.localPath, e);
                res.previewUrl = '';
            }
        });
        try {
            await Promise.all(tasks);
        } catch (e) {
            console.error('刷新资源预览时出错', e);
        }
    };

    // ================== 应用资源到控件 ==================

    const applyResourceToSelection = (res: ImageResource) => {
        if (!selectedWidget.value) {
            message.value = '请先选中一个控件';
            return;
        }
        selectedWidget.value.image = res.value;
        message.value = `已将资源 ${res.label} 应用到控件 ${selectedWidget.value.name}`;
    };

    // ================== 悬浮预览 ==================

    const onResourceMouseEnter = (res: ImageResource, ev: MouseEvent) => {
        updateHoverPreviewPosition(ev);
        hoverPreview.value = {
            visible: true,
            x: hoverPreview.value.x,
            y: hoverPreview.value.y,
            res,
        };
    };

    const onResourceMouseMove = (ev: MouseEvent) => {
        if (!hoverPreview.value.visible) return;
        updateHoverPreviewPosition(ev);
    };

    const onResourceMouseLeave = () => {
        hoverPreview.value.visible = false;
        hoverPreview.value.res = null;
    };

    const updateHoverPreviewPosition = (ev: MouseEvent) => {
        if (!resourcesPanelRef.value) return;
        const uiScale = uiZoom.value || 1;
        const panelRect = resourcesPanelRef.value.getBoundingClientRect();
        const baseClientX = ev.clientX / uiScale;
        const baseClientY = ev.clientY / uiScale;
        const previewWidth = 200;
        const previewHeight = 200;
        const padding = 10;

        let x = baseClientX - panelRect.left / uiScale + padding;
        const maxX = panelRect.width / uiScale - previewWidth - padding;
        if (x > maxX) x = maxX;

        let y = baseClientY - panelRect.top / uiScale - previewHeight - padding;
        const maxY = panelRect.height / uiScale - 20;
        if (y > maxY) y = maxY;
        hoverPreview.value.x = Math.max(padding, x);
        hoverPreview.value.y = Math.max(padding, y);
    };

    return {
        // Refs
        resourcesGridRef,
        resourcesPanelRef,
        isResourcesDragOver,
        hoverPreview,
        // 拖拽 UI
        onResourcesDragEnter,
        onResourcesDragOver,
        onResourcesDragLeave,
        // 路径收集（供 App.vue 在 project/global 两种 scope 下统一路由）
        collectWebDropPaths,
        collectTauriDropPaths,
        pickImportPaths,
        // 预览 / 应用
        refreshResourcePreviewsFromLocal,
        applyResourceToSelection,
        onResourceMouseEnter,
        onResourceMouseMove,
        onResourceMouseLeave,
    };
}
