import { ref, type Ref } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { open as tauriOpen, save as tauriSave } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import type { Widget, Settings, Animation } from '../types';
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

const IMAGE_FIELDS = ['image', 'clickImage', 'hoverImage'] as const;

/**
 * 读取项目文本：优先走后端 command（不受 fs:scope 限制），失败再回退 plugin-fs。
 */
async function readProjectText(filePath: string): Promise<string> {
    try {
        const b64 = await invoke<string>('read_file_as_base64', { absPath: filePath });
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return new TextDecoder('utf-8').decode(bytes);
    } catch {
        return await readTextFile(filePath);
    }
}

/** 统一反斜杠风格（war3 路径风格）。 */
const toBackslash = (p: string): string => (p || '').replace(/\//g, '\\');
/** 统一正斜杠风格（磁盘绝对路径）。 */
const toForwardSlash = (p: string): string => (p || '').replace(/\\/g, '/');

/** 判断一个字符串是不是"绝对磁盘路径"——用于区分 `D:/foo/bar` 和 `icons\foo.blp`。 */
const isAbsolutePath = (s: string): boolean => {
    if (!s) return false;
    // Windows: `X:/` 或 `X:\`、UNC `\\server\share`
    if (/^[a-zA-Z]:[\\/]/.test(s)) return true;
    if (/^\\\\/.test(s)) return true;
    // POSIX
    if (s.startsWith('/')) return true;
    return false;
};

/** 把运行时的 widget.image（可能是绝对路径 / `war3mapImported\xxx` / 空）转换为落盘 relPath。
 *  - 绝对路径：若位于 globalRoot 下，相对化；否则保留原路径（兜底，跨机器可能失效，但不丢）。
 *  - `war3mapImported\xxx`：剥前缀得到 relPath。
 *  - 其它：原样返回。 */
function absToRel(abs: string, globalRoot: string): string {
    if (!abs) return '';
    // `war3mapImported\xxx` 兼容
    const stripped = abs.replace(/^war3mapImported[\\/]+/i, '');
    if (stripped !== abs) return toBackslash(stripped);

    if (!isAbsolutePath(abs)) {
        return toBackslash(abs);
    }
    if (!globalRoot) {
        return toBackslash(abs);
    }
    const rootN = toForwardSlash(globalRoot).replace(/\/+$/, '').toLowerCase();
    const absN = toForwardSlash(abs);
    if (absN.toLowerCase().startsWith(rootN + '/')) {
        return toBackslash(absN.slice(rootN.length + 1));
    }
    // 不在全局库下——保留绝对路径；等下次打开时会被识别为"库外引用"。
    return abs;
}

/** 把落盘的 relPath（或老格式的 `war3mapImported\xxx` / 绝对路径兜底）转换为运行时绝对路径。
 *  - 绝对路径：原样。
 *  - 其它：拼 globalRoot + rel。没有 globalRoot 时留原样（画布会显示"预览缺失"）。 */
function relToAbs(rel: string, globalRoot: string): string {
    if (!rel) return '';
    const stripped = rel.replace(/^war3mapImported[\\/]+/i, '');
    if (isAbsolutePath(stripped)) return toForwardSlash(stripped);
    if (!globalRoot) return stripped; // 保留 rel，下次配好再开
    const root = toForwardSlash(globalRoot).replace(/\/+$/, '');
    return `${root}/${toForwardSlash(stripped)}`;
}

/** 就地把一组 widget 的图像字段做转换；返回新对象数组。 */
function transformWidgetImages(
    widgets: Widget[],
    mode: 'absToRel' | 'relToAbs',
    globalRoot: string,
): Widget[] {
    const fn = mode === 'absToRel' ? absToRel : relToAbs;
    return widgets.map((w) => {
        const next: any = { ...w };
        for (const f of IMAGE_FIELDS) {
            const v = (w as any)[f];
            if (typeof v === 'string' && v.length > 0) {
                next[f] = fn(v, globalRoot);
            }
        }
        return next as Widget;
    });
}

export function useProjectFile(
    widgetsList: Ref<Widget[]>,
    selectedIds: Ref<number[]>,
    nextId: Ref<number>,
    settings: Ref<Settings>,
    animations: Ref<Animation[]>,
    nextAnimIdAnim: Ref<number>,
    exportResourcesEnabled: Ref<boolean>,
    exportResourcesPath: Ref<string>,
    exportCodeEnabled: Ref<boolean>,
    exportCodePath: Ref<string>,
    selectedExportPlugin: Ref<string>,
    exportPlugins: Ref<ExportPlugin[]>,
    pushHistory: () => void,
    addRecentProject: (filePath: string) => void,
    message: Ref<string>,
    showWelcome: Ref<boolean>,
    /** 全局资源库根目录（来自 settings.globalResourceRootPath）。save/load 时用于 abs↔rel 转换。 */
    globalResourceRoot: Ref<string>,
) {
    const projectFileInput = ref<HTMLInputElement | null>(null);
    const currentProjectPath = ref<string | null>(null);

    const buildProjectJson = (): string => {
        // 用户级字段从项目设置里摘掉（跟随本机，不跨机器）
        const {
            globalResourceRootPath: _grlPath,
            defaultConvertToBlp: _convert,
            ...projectScopedSettings
        } = settings.value as any;

        const widgetsForDisk = transformWidgetImages(
            widgetsList.value,
            'absToRel',
            globalResourceRoot.value || '',
        );

        const data = {
            schemaVersion: PROJECT_SCHEMA_VERSION,
            widgets: widgetsForDisk,
            settings: projectScopedSettings,
            // 动画
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

    const applyLoadedData = (data: any): boolean => {
        if (!versionGte(data.schemaVersion, MIN_SUPPORTED_SCHEMA)) {
            message.value =
                `项目格式已不兼容（需要 schema ${MIN_SUPPORTED_SCHEMA}+，当前=${data.schemaVersion || '<missing>'}）。` +
                '请在新版 ui-designer 中重建项目。';
            return false;
        }
        if (Array.isArray(data.widgets)) {
            pushHistory();
            const hydrated = transformWidgetImages(
                data.widgets as Widget[],
                'relToAbs',
                globalResourceRoot.value || '',
            );
            widgetsList.value = hydrated;
            selectedIds.value = [];
            nextId.value =
                (hydrated.reduce((m: number, w: Widget) => Math.max(m, w.id || 0), 0) || 0) + 1;
        }
        if (data.settings) {
            // 把用户级（跨机器）字段剥掉
            const incoming = { ...data.settings };
            delete incoming.globalResourceRootPath;
            delete incoming.defaultConvertToBlp;
            settings.value = {
                ...settings.value,
                ...incoming,
            };
        }
        // 动画
        if (Array.isArray(data.animations)) {
            animations.value = data.animations as Animation[];
            nextAnimIdAnim.value =
                (data.animations.reduce((m: number, a: Animation) => Math.max(m, a.id || 0), 0) || 0) + 1;
        } else {
            animations.value = [];
            nextAnimIdAnim.value = 1;
        }
        // 导出配置
        if (data.exportConfig) {
            const config = data.exportConfig as ExportConfig;
            exportResourcesEnabled.value = config.exportResourcesEnabled ?? false;
            exportResourcesPath.value = config.exportResourcesPath || '';
            exportCodeEnabled.value = config.exportCodeEnabled ?? config.exportLuaEnabled ?? true;
            exportCodePath.value = config.exportCodePath || config.exportLuaPath || '';
            if (config.selectedExportPlugin) {
                selectedExportPlugin.value = config.selectedExportPlugin;
            }
            if (Array.isArray(config.exportPlugins)) {
                exportPlugins.value = config.exportPlugins;
            }
        }
        return true;
    };

    const saveProjectToFile = async (): Promise<boolean> => {
        const json = buildProjectJson();

        try {
            let filePath = currentProjectPath.value;
            if (!filePath) {
                filePath = await tauriSave({
                    title: '保存项目',
                    filters: [{ name: 'UI 项目文件', extensions: ['uiproj', 'json'] }],
                    defaultPath: 'ui-project.uiproj',
                });
                if (!filePath) return false;
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

    const saveProjectAsFile = async (): Promise<boolean> => {
        const json = buildProjectJson();

        try {
            const filePath = await tauriSave({
                title: '另存为',
                filters: [{ name: 'UI 项目文件', extensions: ['uiproj', 'json'] }],
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
            const json = await readProjectText(filePath);
            const data = JSON.parse(json) as any;
            if (!applyLoadedData(data)) return;
            currentProjectPath.value = filePath;
            addRecentProject(filePath);
            showWelcome.value = false;
            clampAllWidgetsInPlace(widgetsList.value, settings.value.canvasWidth, settings.value.canvasHeight);
            message.value = '项目已从文件载入：' + filePath;
        } catch (e: any) {
            console.error('载入项目失败', e);
            message.value = '载入项目失败：' + (e?.message || String(e));
        }
    };

    const loadProjectFromFile = async () => {
        try {
            const selected = await tauriOpen({
                title: '打开项目',
                multiple: false,
                filters: [{ name: 'UI 项目文件', extensions: ['uiproj', 'json'] }],
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
                if (!applyLoadedData(data)) {
                    input.value = '';
                    return;
                }
                currentProjectPath.value = null;
                clampAllWidgetsInPlace(widgetsList.value, settings.value.canvasWidth, settings.value.canvasHeight);
                message.value = '项目已从文件载入：' + file.name;
            } catch (e) {
                console.error('载入项目失败', e);
                message.value = '载入项目失败';
            } finally {
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

    const handleNewProject = () => {
        widgetsList.value = [];
        selectedIds.value = [];
        nextId.value = 1;

        animations.value = [];
        nextAnimIdAnim.value = 1;

        exportResourcesEnabled.value = false;
        exportResourcesPath.value = '';
        exportCodeEnabled.value = true;
        exportCodePath.value = '';

        currentProjectPath.value = null;

        pushHistory();
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
