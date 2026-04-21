import { ref, type Ref } from 'vue';
import { open as tauriOpen, save as tauriSave } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import type { Widget, Settings, ImageResource, Animation } from '../types';
import { PROJECT_SCHEMA_VERSION } from '../types';
import { clampAllWidgetsInPlace } from './widgetCanvasBounds';
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

/**
 * 载入 .uiproj 时用的 hydrate 回调：把磁盘上只有 {label, globalRelPath, value}
 * 的原始条目，补齐 localPath/missing 字段。由调用方（App.vue）把全局库 composable
 * 里的 `hydrateProjectRefs` 传进来；这样 useProjectFile 不用反向依赖全局库。
 *
 * 如果全局库根未配置，实现方应把所有条目标成 `missing: true`。
 */
export type HydrateProjectRefs = (
    raw: Array<{ label: string; globalRelPath: string; value?: string }>,
) => Promise<ImageResource[]>;

/** 简单语义版本比较：a >= b ? */
function versionGte(a: string | undefined, b: string): boolean {
    if (!a) return false;
    const pa = a.split('.').map((x) => parseInt(x, 10) || 0);
    const pb = b.split('.').map((x) => parseInt(x, 10) || 0);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const x = pa[i] || 0;
        const y = pb[i] || 0;
        if (x > y) return true;
        if (x < y) return false;
    }
    return true;
}

const MIN_SUPPORTED_SCHEMA = '2.0.0';

/** 把 .uiproj 里的 resources 数组归一化成 hydrate 需要的形态。
 *  schema 2.0.0 以后只认 globalRelPath；对缺失字段的条目返回 null 供上层过滤。 */
function normalizeRawResources(
    raw: any[],
): Array<{ label: string; globalRelPath: string; value?: string }> {
    const out: Array<{ label: string; globalRelPath: string; value?: string }> = [];
    for (const r of raw || []) {
        if (!r || typeof r !== 'object') continue;
        const rel = typeof r.globalRelPath === 'string' ? r.globalRelPath : '';
        if (!rel) continue; // 老条目没有 globalRelPath，直接丢（schema 会在前面拦下来）
        out.push({
            label: String(r.label || ''),
            globalRelPath: rel,
            value: typeof r.value === 'string' ? r.value : undefined,
        });
    }
    return out;
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
    showWelcome: Ref<boolean>,
    /**
     * Schema 2.0.0 起强制要求的 hydrate 回调。App.vue 里注入全局库 composable 的
     * `hydrateProjectRefs`；保持可选是为了给 Web dev 路径兜底（handleProjectFileSelected）。
     */
    hydrateRefs?: HydrateProjectRefs,
) {
    const projectFileInput = ref<HTMLInputElement | null>(null);
    const currentProjectPath = ref<string | null>(null);

    const buildProjectJson = (): string => {
        // 把用户级（跨项目共享）的设置字段从项目文件里摘掉：
        //  - globalResourceRootPath / defaultConvertToBlp 是本机全局库配置，
        //    跟随用户电脑，不该被写进 .uiproj 导致另一台机器打开时被覆盖成不存在的盘符。
        const {
            globalResourceRootPath: _grlPath,
            defaultConvertToBlp: _convert,
            ...projectScopedSettings
        } = settings.value as any;
        const data = {
            schemaVersion: PROJECT_SCHEMA_VERSION,
            widgets: widgetsList.value,
            settings: projectScopedSettings,
            // Schema 2.0.0：只落盘三个字段。localPath / previewUrl / missing
            // 全是"当前机器运行态"，每次开项目现场推导；避免换机器后 pinned 的
            // 盘符变成野指针。
            resources: imageResources.value.map((r) => ({
                label: r.label,
                globalRelPath: r.globalRelPath || '',
                value: r.value,
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

            // Schema 硬拒：2.0.0 起资源模型改为全局库引用，老工程语义不同，直接拒。
            if (!versionGte(data.schemaVersion, MIN_SUPPORTED_SCHEMA)) {
                message.value =
                    `项目格式已不兼容（需要 schema ${MIN_SUPPORTED_SCHEMA}+，当前=${data.schemaVersion || '<missing>'}）。` +
                    '请在新版 ui-designer 中重建项目。';
                return;
            }

            if (Array.isArray(data.widgets)) {
                pushHistory();
                widgetsList.value = data.widgets as Widget[];
                selectedIds.value = [];
                nextId.value =
                    (data.widgets.reduce((m: number, w: Widget) => Math.max(m, w.id || 0), 0) || 0) + 1;
            }
            if (data.settings) {
                // 把用户级（跨机器）字段剥掉，避免另一台机器上盘符不存在。
                const incoming = { ...data.settings };
                delete incoming.globalResourceRootPath;
                delete incoming.defaultConvertToBlp;
                settings.value = {
                    ...settings.value,
                    ...incoming,
                };
            }
            if (Array.isArray(data.resources)) {
                const raw = normalizeRawResources(data.resources);
                if (hydrateRefs) {
                    imageResources.value = await hydrateRefs(raw);
                } else {
                    // 兜底：没提供 hydrate 回调时只还原"引用元数据"，
                    // missing=true，预览/localPath 等全空；等用户配置全局库后重开项目。
                    imageResources.value = raw.map((r) => ({
                        label: r.label,
                        globalRelPath: r.globalRelPath,
                        value: r.value || '',
                        previewUrl: '',
                        missing: true,
                    }));
                }
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
            clampAllWidgetsInPlace(widgetsList.value, settings.value.canvasWidth, settings.value.canvasHeight);
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
        reader.onload = async () => {
            try {
                const json = reader.result as string;
                const data = JSON.parse(json) as any;

                if (!versionGte(data.schemaVersion, MIN_SUPPORTED_SCHEMA)) {
                    message.value =
                        `项目格式已不兼容（需要 schema ${MIN_SUPPORTED_SCHEMA}+，当前=${data.schemaVersion || '<missing>'}）。` +
                        '请在新版 ui-designer 中重建项目。';
                    input.value = '';
                    return;
                }

                if (Array.isArray(data.widgets)) {
                    pushHistory();
                    widgetsList.value = data.widgets as Widget[];
                    selectedIds.value = [];
                    nextId.value =
                        (data.widgets.reduce((m: number, w: Widget) => Math.max(m, w.id || 0), 0) || 0) + 1;
                }
                if (data.settings) {
                    const incoming = { ...data.settings };
                    delete incoming.globalResourceRootPath;
                    delete incoming.defaultConvertToBlp;
                    settings.value = {
                        ...settings.value,
                        ...incoming,
                    };
                }
                if (Array.isArray(data.resources)) {
                    const raw = normalizeRawResources(data.resources);
                    if (hydrateRefs) {
                        imageResources.value = await hydrateRefs(raw);
                    } else {
                        imageResources.value = raw.map((r) => ({
                            label: r.label,
                            globalRelPath: r.globalRelPath,
                            value: r.value || '',
                            previewUrl: '',
                            missing: true,
                        }));
                    }
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
                currentProjectPath.value = null; // 当前通过 input 打开的项目不记录磁盘路径
                clampAllWidgetsInPlace(widgetsList.value, settings.value.canvasWidth, settings.value.canvasHeight);
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

