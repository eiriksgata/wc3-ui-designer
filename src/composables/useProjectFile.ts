import { ref, type Ref } from 'vue';
import { open as tauriOpen, save as tauriSave } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import type { Widget, Settings, ImageResource, Animation } from '../types';
import type { ExportPlugin } from '../types/plugin';

interface ExportConfig {
    exportResourcesEnabled: boolean;
    exportResourcesPath: string;
    // 新字段
    exportCodeEnabled?: boolean;
    exportCodePath?: string;
    // 旧字段（向后兼容）
    exportLuaEnabled?: boolean;
    exportLuaPath?: string;
    // 已移除的字段（不再使用）
    exportPluginEnabled?: boolean;
    exportPluginPath?: string;
    selectedExportPlugin: string;
    exportPlugins: ExportPlugin[];
}

export function useProjectFile(
    widgetsList: Ref<Widget[]>,
    selectedIds: Ref<number[]>,
    nextId: Ref<number>,
    settings: Ref<Settings>,
    imageResources: Ref<ImageResource[]>,
    animations: Ref<Animation[]>,
    nextAnimIdAnim: Ref<number>,
    exportResourcesEnabled: Ref<boolean>,
    exportResourcesPath: Ref<string>,
    exportCodeEnabled: Ref<boolean>,
    exportCodePath: Ref<string>,
    selectedExportPlugin: Ref<string>,
    exportPlugins: Ref<ExportPlugin[]>,
    pushHistory: () => void,
    refreshResourcePreviewsFromLocal: () => Promise<void>,
    addRecentProject: (filePath: string) => void,
    message: Ref<string>,
    showWelcome: Ref<boolean>
) {
    const projectFileInput = ref<HTMLInputElement | null>(null);
    const currentProjectPath = ref<string | null>(null);

    const buildProjectJson = (): string => {
        const data = {
            widgets: widgetsList.value,
            settings: settings.value,
            resources: imageResources.value.map((r) => ({
                label: r.label,
                value: r.value,
                localPath: r.localPath || '',
            })),
            // 动画数据一起存到项目里
            animations: animations.value,
            nextAnimId: nextAnimIdAnim.value,
            exportConfig: {
                exportResourcesEnabled: exportResourcesEnabled.value,
                exportResourcesPath: exportResourcesPath.value,
                exportCodeEnabled: exportCodeEnabled.value,
                exportCodePath: exportCodePath.value,
                selectedExportPlugin: selectedExportPlugin.value,
                exportPlugins: exportPlugins.value,
            },
        };
        return JSON.stringify(data, null, 2);
    };

    // 返回 true 表示确实保存到磁盘；false 表示用户取消或保存失败
    const saveProjectToFile = async (): Promise<boolean> => {
        const json = buildProjectJson();

        try {
            let filePath = currentProjectPath.value;
            if (!filePath) {
                filePath = await tauriSave({
                    title: '保存项目',
                    filters: [
                        { name: 'UI 项目文件', extensions: ['uiproj', 'json'] },
                    ],
                    defaultPath: 'ui-project.uiproj',
                });
                // 用户在保存对话框点了"取消"
                if (!filePath) {
                    return false;
                }
                currentProjectPath.value = filePath;
            }
            await writeTextFile(filePath, json);
            message.value = '项目已保存到文件：' + filePath;
            return true;
        } catch (e: any) {
            console.error('保存项目失败', e);
            message.value = '保存项目失败：' + (e.message || String(e));
            return false;
        }
    };

    // 另存为：返回 true 表示保存成功，false 表示取消或失败
    const saveProjectAsFile = async (): Promise<boolean> => {
        const json = buildProjectJson();

        try {
            const filePath = await tauriSave({
                title: '另存为',
                filters: [
                    { name: 'UI 项目文件', extensions: ['uiproj', 'json'] },
                ],
                defaultPath: 'ui-project.uiproj',
            });
            if (!filePath) return false;
            await writeTextFile(filePath, json);
            currentProjectPath.value = filePath;
            addRecentProject(filePath);
            message.value = '项目已另存为：' + filePath;
            return true;
        } catch (e: any) {
            console.error('另存为失败', e);
            message.value = '另存为失败：' + (e.message || String(e));
            return false;
        }
    };

    const openProjectFromPath = async (filePath: string) => {
        try {
            const json = await readTextFile(filePath);
            const data = JSON.parse(json) as any;
            if (Array.isArray(data.widgets)) {
                pushHistory();
                widgetsList.value = data.widgets as Widget[];
                selectedIds.value = [];
                nextId.value =
                    (data.widgets.reduce((m: number, w: Widget) => Math.max(m, w.id || 0), 0) || 0) + 1;
            }
            if (data.settings) {
                settings.value = {
                    ...settings.value,
                    ...data.settings,
                };
            }
            if (Array.isArray(data.resources)) {
                imageResources.value = data.resources.map((r: any) => ({
                    label: r.label,
                    value: r.value,
                    localPath: r.localPath || '',
                    previewUrl: '',
                }));
                await refreshResourcePreviewsFromLocal();
            }
            // 恢复动画数据
            if (Array.isArray(data.animations)) {
                animations.value = data.animations as Animation[];
                nextAnimIdAnim.value =
                    (data.animations.reduce((m: number, a: Animation) => Math.max(m, a.id || 0), 0) || 0) + 1;
            } else {
                animations.value = [];
                nextAnimIdAnim.value = 1;
            }
            // 恢复导出配置（支持新旧字段名）
            if (data.exportConfig) {
                const config = data.exportConfig as ExportConfig;
                exportResourcesEnabled.value = config.exportResourcesEnabled ?? false;
                exportResourcesPath.value = config.exportResourcesPath || '';
                // 优先使用新字段，如果没有则使用旧字段（向后兼容）
                exportCodeEnabled.value = config.exportCodeEnabled ?? config.exportLuaEnabled ?? true;
                exportCodePath.value = config.exportCodePath || config.exportLuaPath || '';
                if (config.selectedExportPlugin) {
                    selectedExportPlugin.value = config.selectedExportPlugin;
                }
                if (Array.isArray(config.exportPlugins)) {
                    exportPlugins.value = config.exportPlugins;
                }
            }
            currentProjectPath.value = filePath;
            addRecentProject(filePath);
            showWelcome.value = false;
            message.value = '项目已从文件载入：' + filePath;
        } catch (e: any) {
            console.error('载入项目失败', e);
            message.value = '载入项目失败';
        }
    };

    const loadProjectFromFile = async () => {
        // 使用 Tauri 原生打开对话框
        try {
            const selected = await tauriOpen({
                title: '打开项目',
                multiple: false,
                filters: [
                    { name: 'UI 项目文件', extensions: ['uiproj', 'json'] },
                ],
            });
            if (!selected) return;
            const filePath = Array.isArray(selected) ? selected[0] : selected;
            await openProjectFromPath(filePath);
        } catch (e: any) {
            console.error('打开项目失败', e);
            message.value = '打开项目失败：' + (e.message || String(e));
        }
    };

    const handleProjectFileSelected = (ev: Event) => {
        const input = ev.target as HTMLInputElement;
        const file = input.files && input.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = () => {
            try {
                const json = reader.result as string;
                const data = JSON.parse(json) as any;
                if (Array.isArray(data.widgets)) {
                    pushHistory();
                    widgetsList.value = data.widgets as Widget[];
                    selectedIds.value = [];
                    nextId.value =
                        (data.widgets.reduce((m: number, w: Widget) => Math.max(m, w.id || 0), 0) || 0) + 1;
                }
                if (data.settings) {
                    settings.value = {
                        ...settings.value,
                        ...data.settings,
                    };
                }
                if (Array.isArray(data.resources)) {
                    imageResources.value = data.resources.map((r: any) => ({
                        label: r.label,
                        value: r.value,
                        localPath: r.localPath || '',
                        previewUrl: '',
                    }));
                    refreshResourcePreviewsFromLocal();
                }
                // 恢复动画数据
                if (Array.isArray(data.animations)) {
                    animations.value = data.animations as Animation[];
                    nextAnimIdAnim.value =
                        (data.animations.reduce((m: number, a: Animation) => Math.max(m, a.id || 0), 0) || 0) + 1;
                } else {
                    animations.value = [];
                    nextAnimIdAnim.value = 1;
                }
                // 恢复导出配置（支持新旧字段名）
                if (data.exportConfig) {
                    const config = data.exportConfig as ExportConfig;
                    exportResourcesEnabled.value = config.exportResourcesEnabled ?? false;
                    exportResourcesPath.value = config.exportResourcesPath || '';
                    // 优先使用新字段，如果没有则使用旧字段（向后兼容）
                    exportCodeEnabled.value = config.exportCodeEnabled ?? config.exportLuaEnabled ?? true;
                    exportCodePath.value = config.exportCodePath || config.exportLuaPath || '';
                    if (config.selectedExportPlugin) {
                        selectedExportPlugin.value = config.selectedExportPlugin;
                    }
                    if (Array.isArray(config.exportPlugins)) {
                        exportPlugins.value = config.exportPlugins;
                    }
                }
                currentProjectPath.value = null; // 当前通过 input 打开的项目不记录磁盘路径
                message.value = '项目已从文件载入：' + file.name;
            } catch (e) {
                console.error('载入项目失败', e);
                message.value = '载入项目失败';
            } finally {
                // 允许下次选择同一个文件触发 change
                input.value = '';
            }
        };
        reader.onerror = () => {
            console.error('读取项目文件失败');
            message.value = '读取项目文件失败';
            input.value = '';
        };
        reader.readAsText(file, 'utf-8');
    };

    // 创建一个全新的空白项目（不依赖外部的 closeProject，由调用方自行决定是否先提示保存等）
    const handleNewProject = () => {
        // 清空控件与选择
        widgetsList.value = [];
        selectedIds.value = [];
        nextId.value = 1;

        // 清空动画
        animations.value = [];
        nextAnimIdAnim.value = 1;

        // 清空资源列表
        imageResources.value = [];

        // 重置导出配置为默认值
        exportResourcesEnabled.value = false;
        exportResourcesPath.value = '';
        exportCodeEnabled.value = true;
        exportCodePath.value = '';

        // 不改变 selectedExportPlugin / exportPlugins，本身由外部控制

        // 清除当前项目路径
        currentProjectPath.value = null;

        // 推入一份历史快照，方便后续撤销
        pushHistory();

        // 退出欢迎界面
        showWelcome.value = false;

        message.value = '已创建空白项目';
    };

    const handleWelcomeNew = () => {
        handleNewProject();
    };

    const handleWelcomeOpen = async () => {
        showWelcome.value = false;
        await loadProjectFromFile();
    };

    const openRecentProject = async (filePath: string) => {
        await openProjectFromPath(filePath);
    };

    // closeProject 需要在 App.vue 中实现，因为它需要调用其他 composable 的函数
    // 这里只提供 currentProjectPath 的清理逻辑
    const clearCurrentProjectPath = () => {
        currentProjectPath.value = null;
    };

    return {
        projectFileInput,
        currentProjectPath,
        buildProjectJson,
        saveProjectToFile,
        saveProjectAsFile,
        openProjectFromPath,
        loadProjectFromFile,
        handleProjectFileSelected,
        handleNewProject,
        handleWelcomeNew,
        handleWelcomeOpen,
        openRecentProject,
        clearCurrentProjectPath,
    };
}

