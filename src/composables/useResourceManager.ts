import { ref, type Ref, type ComputedRef } from 'vue';
import { open as tauriOpen } from '@tauri-apps/plugin-dialog';
import { readFile, readDir } from '@tauri-apps/plugin-fs';
import { decodeTgaToDataUrl } from '../utils/tgaDecoder';
import type { ImageResource, Widget } from '../types';

interface FileEntry {
    path: string;
    name: string;
    relativePath: string;
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

    // 递归读取文件夹中的所有图片文件
    const readDirectoryRecursive = async (dirPath: string, basePath: string = ''): Promise<FileEntry[]> => {
        const imageFiles: FileEntry[] = [];
        const allowedExts = ['blp', 'png', 'tga', 'bmp', 'jpg', 'jpeg'];

        try {
            const entries = await readDir(dirPath);
            for (const entry of entries) {
                const fullPath = dirPath + (dirPath.endsWith('\\') || dirPath.endsWith('/') ? '' : '\\') + entry.name;
                const relativePath = basePath ? basePath + '\\' + entry.name : entry.name;

                if (entry.isDirectory) {
                    // 递归读取子文件夹
                    const subFiles = await readDirectoryRecursive(fullPath, relativePath);
                    imageFiles.push(...subFiles);
                } else if (entry.isFile) {
                    // 检查是否是图片文件
                    const ext = entry.name.split('.').pop()?.toLowerCase();
                    if (ext && allowedExts.includes(ext)) {
                        imageFiles.push({
                            path: fullPath,
                            name: entry.name,
                            relativePath: relativePath.replace(/\//g, '\\'),
                        });
                    }
                }
            }
        } catch (e) {
            console.error('读取文件夹失败:', dirPath, e);
        }

        return imageFiles;
    };

    // 处理资源文件（单个文件或文件夹中的文件）
    const processResourceFiles = async (files: FileEntry[]): Promise<ImageResource[]> => {
        const newResources: ImageResource[] = [];

        for (const file of files) {
            try {
                // 处理路径对象
                let filePath = '';
                let fileName = '';
                let relativePath = '';

                if (file.path) {
                    // Tauri 环境的路径对象
                    filePath = file.path;
                    fileName = file.name || filePath.split(/[/\\]/).pop() || '';
                    relativePath = file.relativePath || fileName;
                } else {
                    console.warn('未知的文件格式:', file);
                    continue;
                }

                const ext = (fileName.split('.').pop() || '').toLowerCase();

                if (!['blp', 'png', 'tga', 'bmp', 'jpg', 'jpeg'].includes(ext)) {
                    continue;
                }

                let previewUrl = '';
                let localPath = filePath;
                let war3Path = relativePath;

                // 读取文件并生成预览
                try {
                    const data = await readFile(filePath);
                    const blob = new Blob([data], { type: 'application/octet-stream' });
                    if (['png', 'jpg', 'jpeg', 'bmp'].includes(ext)) {
                        previewUrl = URL.createObjectURL(blob);
                    } else if (ext === 'tga') {
                        previewUrl = await decodeTgaToDataUrl(blob);
                    }
                } catch (e) {
                    console.error('读取资源文件失败:', filePath, e);
                }

                newResources.push({
                    label: fileName,
                    value: war3Path,
                    localPath,
                    previewUrl,
                });
            } catch (e) {
                console.error('处理文件失败:', file, e);
            }
        }

        return newResources;
    };

    // 资源拖拽进入
    const onResourcesDragEnter = (ev: DragEvent) => {
        ev.preventDefault();
        ev.stopPropagation();
        isResourcesDragOver.value = true;
        console.log('拖拽进入资源管理器');
    };

    // 资源拖拽悬停
    const onResourcesDragOver = (ev: DragEvent) => {
        ev.preventDefault();
        ev.stopPropagation();
        isResourcesDragOver.value = true;
    };

    // 资源拖拽离开
    const onResourcesDragLeave = (ev: DragEvent) => {
        ev.preventDefault();
        ev.stopPropagation();
        // 只有当离开资源管理器区域时才取消高亮
        const target = ev.currentTarget as HTMLElement;
        const rect = target.getBoundingClientRect();
        const x = ev.clientX;
        const y = ev.clientY;

        // 检查鼠标是否真的离开了区域
        if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
            isResourcesDragOver.value = false;
            console.log('拖拽离开资源管理器');
        }
    };

    // 资源拖拽放下
    const onResourcesDrop = async (ev: DragEvent) => {
        ev.preventDefault();
        ev.stopPropagation();
        isResourcesDragOver.value = false;

        console.log('拖拽放下事件触发');

        try {
            const files: FileEntry[] = [];
            const dataTransfer = ev.dataTransfer;

            if (!dataTransfer) {
                console.error('DataTransfer 对象不存在');
                message.value = '拖拽数据无效';
                return;
            }

            console.log('拖拽数据:', {
                files: dataTransfer.files ? dataTransfer.files.length : 0,
                items: dataTransfer.items ? dataTransfer.items.length : 0,
                types: Array.from(dataTransfer.types || []),
            });

            if (!dataTransfer.files || dataTransfer.files.length === 0) {
                console.warn('DataTransfer 中没有文件');
                message.value = '没有检测到文件，请确保拖拽的是文件或文件夹';
                return;
            }

            // 从 DataTransfer.files 获取文件
            if (dataTransfer.files && dataTransfer.files.length > 0) {
                for (let i = 0; i < dataTransfer.files.length; i++) {
                    const file = dataTransfer.files[i];
                    console.log('拖拽文件:', file.name, 'path:', (file as any).path);

                    // 尝试获取文件路径
                    let filePath = (file as any).path;

                    // 如果没有 path，提示用户使用文件选择对话框
                    if (!filePath) {
                        message.value = '拖拽可能无法获取文件路径，请使用"导入资源"按钮选择文件或文件夹';
                        return;
                    }

                    // 检查是否是文件夹
                    try {
                        const entries = await readDir(filePath);
                        // 是文件夹，递归读取
                        const dirFiles = await readDirectoryRecursive(filePath, '');
                        files.push(...dirFiles);
                    } catch (e) {
                        // 不是文件夹，是文件
                        const fileName = filePath.split(/[/\\]/).pop() || file.name;
                        files.push({
                            path: filePath,
                            name: fileName,
                            relativePath: fileName,
                        });
                    }
                }
            } else {
                message.value = '没有检测到文件，请使用"导入资源"按钮选择文件或文件夹';
                return;
            }

            if (files.length === 0) {
                message.value = '没有检测到文件';
                console.warn('拖拽未检测到文件');
                return;
            }

            console.log('处理文件数量:', files.length);
            const newResources = await processResourceFiles(files);
            console.log('处理后的资源数量:', newResources.length);

            if (newResources.length > 0) {
                // 去重：使用 Map 确保相同路径的资源只保留一个
                const map = new Map<string, ImageResource>();
                (imageResources.value || []).forEach((r) => map.set(r.value, r));
                newResources.forEach((r) => {
                    if (!map.has(r.value)) map.set(r.value, r);
                });
                imageResources.value = Array.from(map.values());
                message.value = `已从拖拽导入 ${newResources.length} 个资源`;
            } else {
                message.value = '没有找到可导入的图片资源（请确保文件格式为：blp, png, tga, bmp, jpg, jpeg）';
            }
        } catch (e: any) {
            console.error('拖拽导入资源失败', e);
            message.value = '拖拽导入资源失败：' + (e.message || String(e));
        }
    };

    // 资源导入按钮点击
    const onImportResourcesClick = async () => {
        try {
            const selected = await tauriOpen({
                title: '导入资源',
                multiple: true,
                filters: [
                    { name: '图片资源', extensions: ['blp', 'png', 'tga', 'bmp', 'jpg', 'jpeg'] },
                ],
            });
            if (!selected) return;
            const paths = Array.isArray(selected) ? selected : [selected];
            const newResources: ImageResource[] = [];
            for (const p of paths) {
                const filePath = String(p);
                const fileName = filePath.split(/[/\\]/).pop() || filePath;
                const ext = (fileName.split('.').pop() || '').toLowerCase();
                let previewUrl = '';
                try {
                    const data = await readFile(filePath);
                    const blob = new Blob([data], { type: 'application/octet-stream' });
                    if (['png', 'jpg', 'jpeg', 'bmp'].includes(ext)) {
                        previewUrl = URL.createObjectURL(blob);
                    } else if (ext === 'tga') {
                        previewUrl = await decodeTgaToDataUrl(blob);
                    } else {
                        previewUrl = '';
                    }
                } catch (e) {
                    console.error('读取本地资源失败:', filePath, e);
                }
                newResources.push({
                    label: fileName,
                    value: fileName,
                    localPath: filePath,
                    previewUrl,
                });
            }
            if (newResources.length) {
                const map = new Map<string, ImageResource>();
                (imageResources.value || []).forEach((r) => map.set(r.value, r));
                newResources.forEach((r) => {
                    if (!map.has(r.value)) map.set(r.value, r);
                });
                imageResources.value = Array.from(map.values());
                message.value = `已从本地导入 ${newResources.length} 个资源`;
            }
        } catch (e) {
            console.error('导入资源失败', e);
            message.value = '导入资源失败';
        }
    };

    // 根据本地路径重新生成资源预览
    const refreshResourcePreviewsFromLocal = async () => {
        const resourcesArr = imageResources.value || [];
        const tasks = resourcesArr.map(async (res) => {
            if (!res.localPath) return;
            const ext = (res.localPath.split('.').pop() || '').toLowerCase();
            try {
                const data = await readFile(res.localPath);
                const blob = new Blob([data], { type: 'application/octet-stream' });
                if (['png', 'jpg', 'jpeg', 'bmp'].includes(ext)) {
                    const url = URL.createObjectURL(blob);
                    res.previewUrl = url;
                } else if (ext === 'tga') {
                    // 复用 TGA 解码逻辑
                    res.previewUrl = await decodeTgaToDataUrl(blob);
                } else {
                    res.previewUrl = '';
                }
            } catch (e) {
                console.error('从本地路径加载资源预览失败:', res.localPath, e);
            }
        });
        try {
            await Promise.all(tasks);
        } catch (e) {
            console.error('刷新资源预览时出错', e);
        }
    };

    // 应用资源到选中的控件
    const applyResourceToSelection = (res: ImageResource) => {
        if (!selectedWidget.value) {
            message.value = '请先选中一个控件';
            return;
        }
        selectedWidget.value.image = res.value;
        message.value = `已将资源 ${res.label} 应用到控件 ${selectedWidget.value.name}`;
    };

    // 资源悬浮预览
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

        // X 轴：鼠标右侧，但不超过面板右边界
        let x = baseClientX - panelRect.left / uiScale + padding;
        const maxX = panelRect.width / uiScale - previewWidth - padding;
        if (x > maxX) x = maxX;

        // Y 轴：预览窗底部在鼠标上方（通过 transform: translateY(-100%) 实现）
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
        // 拖拽相关
        onResourcesDragEnter,
        onResourcesDragOver,
        onResourcesDragLeave,
        onResourcesDrop,
        // 导入相关
        onImportResourcesClick,
        refreshResourcePreviewsFromLocal,
        // 应用资源
        applyResourceToSelection,
        // 悬浮预览
        onResourceMouseEnter,
        onResourceMouseMove,
        onResourceMouseLeave,
    };
}

