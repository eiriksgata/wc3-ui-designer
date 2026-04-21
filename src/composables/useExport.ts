import { ref, type Ref, onMounted } from 'vue';
import { open as tauriOpen, save as tauriSave } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { writeTextFile, readTextFile, mkdir } from '@tauri-apps/plugin-fs';
import type { Widget, ImageResource, Animation, Settings } from '../types';
import type { ExportPlugin, ExportContext } from '../types/plugin';
import { usePluginSystem } from './usePluginSystem';

type CurrentProjectPathRef = Ref<string | null> | (() => string | null) | null;

/** 导出时用于"扫 widgets -> 反查全局库 -> 拷贝"的最小字段子集。 */
interface GlobalLibEntry {
    label?: string;
    /** 绝对磁盘路径（schema 2.0.0 里 widget.image 运行时用的值）。 */
    value: string;
    localPath?: string;
    /** 全局库下的 relPath（反斜杠风格，例 `icons\foo.blp`）。 */
    relPath?: string;
}

const WAR3_PREFIX = 'war3mapImported\\';
const IMAGE_FIELDS = ['image', 'clickImage', 'hoverImage'] as const;

/** 判断是不是绝对磁盘路径。 */
const isAbsolutePath = (s: string): boolean => {
    if (!s) return false;
    if (/^[a-zA-Z]:[\\/]/.test(s)) return true;
    if (/^\\\\/.test(s)) return true;
    if (s.startsWith('/')) return true;
    return false;
};

/** 把绝对路径按全局库根推导 relPath；不在库下就只取文件名（兜底）。 */
function deriveRelPath(abs: string, lookupByAbs: Map<string, GlobalLibEntry>): string {
    const hit = lookupByAbs.get(abs) || lookupByAbs.get(abs.toLowerCase());
    if (hit?.relPath) return hit.relPath.replace(/\//g, '\\').replace(/^\\+/, '');
    // 兜底：用 basename
    const parts = abs.split(/[\\/]/);
    return parts[parts.length - 1] || abs;
}

export function useExport(
    widgetsList: Ref<Widget[]>,
    settings: Ref<Settings>,
    message: Ref<string>,
    saveProjectToFile: () => Promise<boolean>,
    getAnimationsForExport: () => Record<string, Omit<Animation, 'id'>[]>,
    /** 全局库条目列表（schema 2.0.0 起导出的权威来源）。 */
    globalResources?: Ref<GlobalLibEntry[]>,
) {
    // currentProjectPath 将在外部设置（可以是 ref 或函数）
    let currentProjectPathRef: CurrentProjectPathRef = null;
    const showExportPanel = ref(false);
    const showExportResultPanel = ref(false);
    const exportResultMessages = ref<string[]>([]);
    const showPluginDebugPanel = ref(false);
    const pluginDebugOutput = ref('');

    // 导出选项
    const exportResourcesEnabled = ref(false);
    const exportResourcesPath = ref('');
    const exportCodeEnabled = ref(true);
    const exportCodePath = ref('');

    // wc3-template-export 专属选项（其他插件会忽略）
    // exportClassName: 指定生成的类名/模块名，为空则使用项目名
    // exportWriteSidecar: 是否在代码旁同时写 *.ui.json 作为反向导入权威来源
    const exportClassName = ref('');
    const exportWriteSidecar = ref(true);

    // 插件系统
    const pluginSystem = usePluginSystem();
    const selectedExportPlugin = ref<string>('lua-export'); // 默认使用 Lua 导出插件
    const exportPlugins = pluginSystem.plugins;

    // 插件编辑器
    const showPluginEditor = ref(false);
    const pluginEditorContent = ref('');
    const pluginEditorName = ref('');
    const pluginEditorPath = ref('');

    const resolveCurrentProjectPath = (): string | null => {
        if (!currentProjectPathRef) return null;
        const resolved =
            typeof currentProjectPathRef === 'function'
                ? currentProjectPathRef()
                : currentProjectPathRef.value;
        return typeof resolved === 'string' && resolved.trim() ? resolved : null;
    };

    // 确认对话框状态
    const showConfirmDialog = ref(false);
    const confirmDialogMessage = ref('');
    const confirmDialogCallback = ref<((confirmed: boolean) => void) | null>(null);

    // 初始化插件系统
    onMounted(async () => {
        await pluginSystem.initializePlugins();
        // 如果没有选中的插件或插件不存在，选择第一个可用插件
        if (exportPlugins.value.length > 0) {
            const currentPlugin = pluginSystem.getPluginById(selectedExportPlugin.value);
            if (!currentPlugin) {
                selectedExportPlugin.value = exportPlugins.value[0].id;
            }
        }
    });

    // 获取默认插件模板代码
    const getDefaultPluginTemplate = (): string => {
        return `import type { ExportPluginModule, ExportContext } from '../../types/plugin';

/**
 * 导出插件模板
 * 此插件定义了如何将 UI 设计器中的控件导出为代码
 */

// 导出函数
function exportFunction(context: ExportContext): string {
    const { widgets, options, animations, imageResources, settings } = context;

    if (!widgets || widgets.length === 0) {
        return '';
    }

    // 使用项目名作为类名，默认 GeneratedUI
    const className = options.fileName || 'GeneratedUI';

    // 在这里编写你的导出逻辑
    // 返回生成的代码字符串
    let code = '';
    code += \`// 由 UI 设计器自动生成\\n\`;
    code += \`// 类名: \${className}\\n\\n\`;

    // 示例：遍历所有控件
    widgets.forEach(widget => {
        code += \`// 控件: \${widget.name} (类型: \${widget.type})\\n\`;
        code += \`// 位置: (\${widget.x}, \${widget.y}), 大小: \${widget.w}x\${widget.h}\\n\`;
    });

    return code;
}

// 插件元数据
export const metadata = {
    id: 'my-custom-plugin',
    name: '我的自定义插件',
    description: '自定义导出插件示例',
    outputFormat: 'custom', // 输出格式标识（如 'lua', 'typescript', 'jass' 等）
    version: '1.0.0',
    type: 'custom' as const,
};

// 导出插件模块
const plugin: ExportPluginModule = {
    metadata,
    export: exportFunction,
};

export default plugin;
`;
    };

    // 保存导出配置到项目文件
    const saveExportConfig = async () => {
        if (saveProjectToFile && typeof saveProjectToFile === 'function') {
            try {
                await saveProjectToFile();
            } catch (e) {
                console.warn('自动保存导出配置失败:', e);
            }
        }
    };

    // 选择资源导出路径
    const selectExportResourcesPath = async () => {
        try {
            const selected = await tauriOpen({
                title: '选择资源导出目录',
                directory: true,
                multiple: false,
            });
            if (selected) {
                exportResourcesPath.value = Array.isArray(selected) ? selected[0] : selected;
                await saveExportConfig();
            }
        } catch (e) {
            console.error('选择资源导出路径失败', e);
            message.value = '选择路径失败';
        }
    };

    // 选择代码导出路径
    const selectExportCodePath = async () => {
        try {
            const plugin = pluginSystem.getPluginById(selectedExportPlugin.value);
            const outputFormat = plugin?.outputFormat || 'code';
            const extension = getFileExtensionForFormat(outputFormat);

            const baseName = getProjectBaseName();
            const selected = await tauriSave({
                title: `保存 ${outputFormat.toUpperCase()} 文件`,
                filters: [
                    { name: `${outputFormat.toUpperCase()} 文件`, extensions: [extension] },
                    { name: '所有文件', extensions: ['*'] },
                ],
                defaultPath: `${baseName}.${extension}`,
            });
            if (selected) {
                exportCodePath.value = selected;
                await saveExportConfig();
            }
        } catch (e) {
            console.error('选择代码导出路径失败', e);
            message.value = '选择路径失败';
        }
    };

    // 根据输出格式获取文件扩展名
    const getFileExtensionForFormat = (format: string): string => {
        const formatMap: Record<string, string> = {
            lua: 'lua',
            typescript: 'ts',
            ts: 'ts',
            javascript: 'js',
            js: 'js',
            jass: 'j',
            json: 'json',
        };
        return formatMap[format.toLowerCase()] || 'txt';
    };

    // 获取当前项目的基础名称（用于类名，例如 xxx.uiproj -> xxx）
    const getProjectBaseName = (): string => {
        const path = resolveCurrentProjectPath();
        if (!path) return 'GeneratedUI';
        const fileName = path.split(/[/\\]/).pop() || '';
        const base = fileName.replace(/\.(uiproj|json)$/i, '');
        return base || 'GeneratedUI';
    };

    /**
     * 在导出边界把 widget.image（运行时 = 绝对路径）改写成引擎侧 `war3mapImported\<rel>` 形式，
     * 同时派生一个和历史 ExportContext 兼容的 imageResources 列表。
     * 这样插件（lua/ts/jass/wc3-template-export 等）不需要知道新的路径模型。
     */
    const buildEngineWidgetsAndResources = (src: Widget[]): { widgets: Widget[]; imageResources: ImageResource[] } => {
        const lookupByAbs = new Map<string, GlobalLibEntry>();
        for (const g of globalResources?.value || []) {
            if (g?.value) {
                lookupByAbs.set(g.value, g);
                lookupByAbs.set(g.value.toLowerCase(), g);
            }
            if (g?.localPath) {
                lookupByAbs.set(g.localPath, g);
                lookupByAbs.set(g.localPath.toLowerCase(), g);
            }
        }

        const usedRel = new Map<string, { label: string; value: string; localPath?: string }>();

        const rewriteValue = (v?: string): string => {
            if (!v) return v || '';
            // 已经是 `war3mapImported\...` 就保留不动
            if (/^war3mapImported[\\/]/i.test(v)) return v;
            if (!isAbsolutePath(v)) return v;
            const rel = deriveRelPath(v, lookupByAbs);
            const value = WAR3_PREFIX + rel;
            const label = rel.split(/[\\/]/).pop() || rel;
            if (!usedRel.has(value)) {
                usedRel.set(value, { label, value, localPath: v });
            }
            return value;
        };

        const widgets = src.map((w) => {
            const next: any = { ...w };
            for (const f of IMAGE_FIELDS) {
                const v = (w as any)[f];
                if (typeof v === 'string' && v.length > 0) {
                    next[f] = rewriteValue(v);
                }
            }
            return next as Widget;
        });

        const imageResources: ImageResource[] = Array.from(usedRel.values()).map((r) => ({
            label: r.label,
            value: r.value,
            localPath: r.localPath,
            relPath: r.value.slice(WAR3_PREFIX.length),
        }));

        return { widgets, imageResources };
    };

    // 使用选中的插件生成代码
    const generateCodeWithPlugin = async (widgets: Widget[], options: any = {}): Promise<string> => {
        if (!widgets || widgets.length === 0) {
            return '';
        }

        const plugin = pluginSystem.getPluginById(selectedExportPlugin.value);

        if (!plugin) {
            throw new Error(`未找到插件: ${selectedExportPlugin.value}`);
        }

        // schema 2.0.0：把 widget.image abs -> war3mapImported\... 再喂给插件
        const { widgets: engineWidgets, imageResources: derivedResources } = buildEngineWidgetsAndResources(widgets);

        const context: ExportContext = {
            widgets: engineWidgets,
            imageResources: derivedResources,
            animations: getAnimationsForExport(),
            settings: {
                canvasWidth: settings.value.canvasWidth,
                canvasHeight: settings.value.canvasHeight,
            },
            options: {
                fileName: options.fileName || getProjectBaseName(),
                resourcePath: options.resourcePath,
                codePath: options.codePath || exportCodePath.value,
                ...options,
            },
        };

        try {
            const result = await pluginSystem.executePlugin(plugin, context);
            // 清空调试输出（成功时）
            pluginDebugOutput.value = '';
            return result || '';
        } catch (e: any) {
            console.error('执行插件失败', e);
            // 显示详细的错误信息到调试面板
            const errorMsg = e.message || String(e);
            pluginDebugOutput.value = `插件执行错误:\n${errorMsg}\n\n请检查:\n1. 插件文件语法是否正确\n2. 插件是否正确导出 metadata 和 export 函数\n3. 插件函数是否正确处理 ExportContext 参数`;
            showPluginDebugPanel.value = true;
            message.value = '执行插件失败，请查看调试输出';
            throw e;
        }
    };

    // 加载自定义插件
    const loadCustomPlugin = async () => {
        try {
            const selected = await tauriOpen({
                title: '选择导出插件文件',
                filters: [
                    { name: 'TypeScript 文件', extensions: ['ts'] },
                    { name: '所有文件', extensions: ['*'] },
                ],
                multiple: false,
            });
            if (selected) {
                const pluginPath = Array.isArray(selected) ? selected[0] : selected;

                // 读取插件文件内容
                const pluginContent = await readTextFile(pluginPath);

                // 尝试将插件复制到 plugins/custom/ 目录以便加载
                // 注意：在实际实现中，我们可能需要将插件文件复制到可访问的位置
                // 或者使用其他加载机制

                // 从文件路径提取插件名称
                const fileName = pluginPath.split(/[/\\]/).pop()?.replace(/\.ts$/, '') || 'custom-plugin';

                // 创建一个临时插件对象（实际加载需要将文件放在 plugins/custom/ 目录）
                const newPlugin: ExportPlugin = {
                    id: `custom_${Date.now()}`,
                    name: fileName,
                    description: '自定义插件',
                    outputFormat: 'custom',
                    type: 'custom',
                    path: pluginPath, // 保存原始路径
                };

                pluginSystem.addPlugin(newPlugin);
                selectedExportPlugin.value = newPlugin.id;
                await saveExportConfig();
                message.value = `已加载插件：${fileName}（注意：插件需要放在 plugins/custom/ 目录才能正常执行）`;
            }
        } catch (e) {
            console.error('加载插件失败', e);
            message.value = '加载插件失败';
        }
    };

    // 创建新插件
    const createNewPlugin = () => {
        pluginEditorName.value = '新插件';
        pluginEditorContent.value = getDefaultPluginTemplate();
        pluginEditorPath.value = '';
        showPluginEditor.value = true;
    };

    // 编辑插件
    const editPlugin = async (pluginId: string) => {
        const plugin = pluginSystem.getPluginById(pluginId);
        if (!plugin) return;

        if (plugin.type === 'builtin') {
            pluginEditorName.value = plugin.name;
            pluginEditorContent.value = getDefaultPluginTemplate();
            pluginEditorPath.value = '';
            message.value = '内置插件不可编辑，这是模板代码';
        } else if (plugin.type === 'custom' && plugin.path) {
            try {
                pluginEditorName.value = plugin.name;
                pluginEditorContent.value = await readTextFile(plugin.path);
                pluginEditorPath.value = plugin.path;
            } catch (e) {
                console.error('读取插件文件失败', e);
                message.value = '读取插件文件失败';
                return;
            }
        }
        showPluginEditor.value = true;
    };

    // 保存插件编辑器内容
    const savePluginEditor = async () => {
        if (!pluginEditorName.value.trim()) {
            message.value = '请输入插件名称';
            return;
        }

        try {
            let pluginPath = pluginEditorPath.value;
            if (!pluginPath) {
                // 新建插件，需要选择保存路径
                const selected = await tauriSave({
                    title: '保存插件文件',
                    filters: [
                        { name: 'TypeScript 文件', extensions: ['ts'] },
                        { name: '所有文件', extensions: ['*'] },
                    ],
                    defaultPath: `${pluginEditorName.value}.ts`,
                });
                if (!selected) return;
                pluginPath = selected;
            }

            await writeTextFile(pluginPath, pluginEditorContent.value);

            // 更新或添加插件到列表
            if (pluginEditorPath.value) {
                // 编辑现有插件
                const plugin = pluginSystem.getPluginById(selectedExportPlugin.value);
                if (plugin && plugin.path === pluginEditorPath.value) {
                    plugin.name = pluginEditorName.value;
                    plugin.path = pluginPath;
                }
            } else {
                // 新建插件
                const newPlugin: ExportPlugin = {
                    id: `custom_${Date.now()}`,
                    name: pluginEditorName.value,
                    description: '自定义插件',
                    outputFormat: 'custom',
                    type: 'custom',
                    path: pluginPath,
                };
                pluginSystem.addPlugin(newPlugin);
                selectedExportPlugin.value = newPlugin.id;
            }

            pluginEditorPath.value = pluginPath;
            showPluginEditor.value = false;
            await saveExportConfig();
            message.value = '插件已保存（注意：插件需要放在 plugins/custom/ 目录才能正常执行）';
        } catch (e: any) {
            console.error('保存插件失败', e);
            message.value = '保存插件失败';
        }
    };

    // 显示确认对话框
    const showConfirm = (msg: string, callback: (confirmed: boolean) => void) => {
        confirmDialogMessage.value = msg;
        confirmDialogCallback.value = callback;
        showConfirmDialog.value = true;
    };

    // 确认对话框：确认
    const confirmDialogOk = () => {
        showConfirmDialog.value = false;
        if (confirmDialogCallback.value) {
            confirmDialogCallback.value(true);
        }
        confirmDialogCallback.value = null;
    };

    // 确认对话框：取消
    const confirmDialogCancel = () => {
        showConfirmDialog.value = false;
        if (confirmDialogCallback.value) {
            confirmDialogCallback.value(false);
        }
        confirmDialogCallback.value = null;
    };

    // 删除插件（通过 ID）
    const deletePluginById = (pluginId: string) => {
        const plugin = pluginSystem.getPluginById(pluginId);

        if (!plugin) {
            message.value = '未找到要删除的插件';
            return;
        }

        // 不能删除内置插件
        if (plugin.type === 'builtin') {
            message.value = '不能删除内置插件';
            return;
        }

        // 显示确认对话框
        showConfirm(`确定要删除插件 "${plugin.name}" 吗？`, (confirmed) => {
            if (!confirmed) {
                return;
            }

            // 从列表中移除
            pluginSystem.removePlugin(pluginId);

            // 如果删除的是当前选中的插件，切换到第一个可用插件
            if (selectedExportPlugin.value === pluginId) {
                if (exportPlugins.value.length > 0) {
                    selectedExportPlugin.value = exportPlugins.value[0].id;
                } else {
                    selectedExportPlugin.value = '';
                }
            }

            // 保存配置
            saveExportConfig().catch(e => {
                console.warn('保存插件配置失败', e);
            });

            message.value = '插件已删除';
        });
    };

    // 删除当前选中的插件（保留原有接口）
    const deletePlugin = () => {
        deletePluginById(selectedExportPlugin.value);
    };

    // 用默认编辑器打开插件文件
    const openPluginWithDefaultEditor = async () => {
        if (!pluginEditorPath.value) {
            message.value = '插件文件路径不存在，请先保存插件';
            return;
        }

        try {
            await invoke('open_file_with_default_editor', {
                filePath: pluginEditorPath.value,
            });
        } catch (e: any) {
            console.error('打开文件失败', e);
            message.value = '打开文件失败：' + (e.message || String(e));
        }
    };

    // 执行导出
    const doExport = async () => {
        if (!exportResourcesEnabled.value && !exportCodeEnabled.value) {
            message.value = '请至少选择一项导出选项';
            return;
        }

        if (!widgetsList.value.length) {
            message.value = '没有控件可以导出';
            return;
        }

        // 导出前检查：同一个父节点下是否存在重名子控件（非空 name）
        const dupPairs: Array<{ parentId: string; name: string; count: number }> = [];
        const byParent = new Map<string, Widget[]>();
        widgetsList.value.forEach((w) => {
            const parentId = w.parentId == null ? '__root__' : String(w.parentId);
            if (!byParent.has(parentId)) byParent.set(parentId, []);
            byParent.get(parentId)!.push(w);
        });
        byParent.forEach((children, pid) => {
            const nameCount: Record<string, number> = {};
            children.forEach((w) => {
                const n = (w.name || '').trim();
                if (!n) return;
                nameCount[n] = (nameCount[n] || 0) + 1;
            });
            Object.keys(nameCount).forEach((n) => {
                if (nameCount[n] > 1) {
                    dupPairs.push({ parentId: pid, name: n, count: nameCount[n] });
                }
            });
        });
        if (dupPairs.length > 0) {
            const preview = dupPairs
                .slice(0, 5)
                .map((d) => d.name)
                .join('、');
            const more = dupPairs.length > 5 ? ' 等' : '';
            const warnMsg = `同一父节点下存在 ${dupPairs.length} 组重名子控件：${preview}${more}。请修改名称后再导出。`;
            exportResultMessages.value = [warnMsg];
            showExportResultPanel.value = true;
            message.value = warnMsg;
            return;
        }

        // 在导出前先保存导出配置
        await saveExportConfig();

        showExportPanel.value = false;
        const messages: string[] = [];

        try {
            // 导出资源（schema 2.0.0 模型）：
            //   widget.image 是绝对路径 -> 在全局库里反查 relPath -> 拷到 exportPath/<rel>
            if (exportResourcesEnabled.value) {
                if (!exportResourcesPath.value) {
                    messages.push('请选择资源导出路径');
                } else {
                    try {
                        await mkdir(exportResourcesPath.value, { recursive: true });

                        // 收集 widgets 引用到的所有绝对路径（三种图像字段都看）
                        const usedAbs = new Set<string>();
                        for (const w of widgetsList.value) {
                            for (const f of IMAGE_FIELDS) {
                                const v = (w as any)[f];
                                if (typeof v === 'string' && v.trim()) usedAbs.add(v);
                            }
                        }

                        if (usedAbs.size === 0) {
                            messages.push('没有控件使用资源，无需导出');
                        } else {
                            // 全局库按 abs 做查找表
                            const lookup = new Map<string, GlobalLibEntry>();
                            for (const g of globalResources?.value || []) {
                                if (g?.value) lookup.set(g.value, g);
                                if (g?.localPath && g.localPath !== g.value) lookup.set(g.localPath, g);
                            }

                            const sep = exportResourcesPath.value.includes('\\') ? '\\' : '/';
                            const normalizeRel = (rel: string) =>
                                (rel || '').replace(/[\\/]+/g, sep).replace(/^[\\/]+/, '');

                            let copiedCount = 0;
                            const missing: string[] = [];
                            const errors: string[] = [];

                            for (const abs of usedAbs) {
                                // 非绝对路径 / 历史残留 `war3mapImported\...` 这里都跳过——
                                // 新模型下 widget.image 必须是绝对路径才会拷贝。
                                if (!isAbsolutePath(abs)) {
                                    missing.push(abs);
                                    continue;
                                }
                                const entry = lookup.get(abs);
                                const src = entry?.localPath || abs;
                                // rel: 优先取全局库给的 relPath；否则兜底用 basename
                                let rel = entry?.relPath || '';
                                if (!rel) {
                                    const parts = abs.split(/[\\/]/);
                                    rel = parts[parts.length - 1] || abs;
                                }
                                const destPath = `${exportResourcesPath.value}${sep}${normalizeRel(rel)}`;

                                try {
                                    await invoke('copy_file_abs', {
                                        src,
                                        dst: destPath,
                                        overwrite: true,
                                    });
                                    copiedCount++;
                                } catch (e: any) {
                                    console.error('复制资源文件失败:', abs, src, e);
                                    errors.push(`${abs} 复制失败：${e.message || e}`);
                                }
                            }

                            if (copiedCount > 0) {
                                messages.push(`已导出 ${copiedCount}/${usedAbs.size} 个资源到：${exportResourcesPath.value}`);
                            }
                            if (missing.length > 0) {
                                const preview = missing.slice(0, 3).join('、');
                                const more = missing.length > 3 ? ' …' : '';
                                messages.push(`有 ${missing.length} 个控件引用的资源不是绝对路径，跳过：${preview}${more}`);
                            }
                            if (errors.length > 0) {
                                messages.push(`部分资源导出失败：${errors.slice(0, 3).join('; ')}${errors.length > 3 ? '...' : ''}`);
                            }
                        }
                    } catch (e: any) {
                        console.error('导出资源失败', e);
                        messages.push('导出资源失败：' + e.message);
                    }
                }
            }

            // 导出代码
            if (exportCodeEnabled.value) {
                try {
                    const plugin = pluginSystem.getPluginById(selectedExportPlugin.value);
                    if (!plugin) {
                        messages.push('未找到选中的插件');
                        return;
                    }

                    const outputFormat = plugin.outputFormat;
                    const extension = getFileExtensionForFormat(outputFormat);

                    // 确定代码文件路径
                    let codeFilePath = exportCodePath.value;
                    if (!codeFilePath) {
                        // 如果没有指定路径，使用默认逻辑
                        const currentPath = currentProjectPathRef
                            ? resolveCurrentProjectPath()
                            : null;
                        if (currentPath) {
                            const projectPath = currentPath;
                            const lastSlash = Math.max(
                                projectPath.lastIndexOf('/'),
                                projectPath.lastIndexOf('\\'),
                            );
                            const dir =
                                lastSlash >= 0 ? projectPath.substring(0, lastSlash) : projectPath;
                            const sep = dir.includes('\\') ? '\\' : '/';
                            const baseName = getProjectBaseName();
                            codeFilePath = `${dir}${sep}${baseName}.${extension}`;
                        } else {
                            const selected = await tauriSave({
                                title: `保存 ${outputFormat.toUpperCase()} 文件`,
                                filters: [
                                    { name: `${outputFormat.toUpperCase()} 文件`, extensions: [extension] },
                                    { name: '所有文件', extensions: ['*'] },
                                ],
                                defaultPath: `GeneratedUI.${extension}`,
                            });
                            if (!selected) {
                                messages.push('代码导出已取消');
                                return;
                            }
                            codeFilePath = selected;
                        }
                    }

                    // 构建导出选项
                    const exportOptions: any = {};
                    if (exportResourcesEnabled.value && exportResourcesPath.value && codeFilePath) {
                        exportOptions.resourcePath = exportResourcesPath.value;
                        exportOptions.codePath = codeFilePath;
                    }
                    // 导出的类名使用当前项目名（xxx.uiproj -> xxx）
                    exportOptions.fileName = getProjectBaseName();
                    // wc3-template-export 专属：允许用户指定类名覆盖项目名
                    if (exportClassName.value && exportClassName.value.trim()) {
                        exportOptions.className = exportClassName.value.trim();
                    }

                    // 使用插件生成代码
                    const code = await generateCodeWithPlugin(widgetsList.value, exportOptions);
                    if (!code) {
                        messages.push('代码导出内容为空');
                    } else {
                        await writeTextFile(codeFilePath, code);
                        messages.push(`${outputFormat.toUpperCase()} 代码已导出到：${codeFilePath}`);
                        // 导出成功后，尝试向 war3.exe 发送一个 F4 热键（仅 Lua 导出）
                        if (outputFormat === 'lua') {
                            try {
                                await invoke('send_f4_to_war3');
                            } catch (e) {
                                console.warn('发送 F4 到 war3.exe 失败:', e);
                            }
                        }

                        // wc3-template-export：同时写 sidecar *.ui.json（权威的反向导入来源）
                        if (
                            selectedExportPlugin.value === 'wc3-template-export' &&
                            exportWriteSidecar.value
                        ) {
                            try {
                                const sidecarPath = codeFilePath.replace(/\.(ts|tsx)$/i, '') + '.ui.json';
                                // sidecar 是"引擎侧"权威来源：外部 codegen.mjs 需要 war3mapImported\<rel>。
                                // 因此这里走 engine-rewritten 的 widgets，和 context.widgets 同一套。
                                const { widgets: sidecarWidgets, imageResources: sidecarImgRes } =
                                    buildEngineWidgetsAndResources(widgetsList.value);
                                const sidecar = {
                                    version: 1,
                                    generator: 'wc3-template-export',
                                    generatedAt: new Date().toISOString(),
                                    projectName: getProjectBaseName(),
                                    className: exportOptions.className || getProjectBaseName(),
                                    settings: {
                                        canvasWidth: settings.value.canvasWidth,
                                        canvasHeight: settings.value.canvasHeight,
                                    },
                                    widgets: sidecarWidgets,
                                    imageResources: sidecarImgRes,
                                    animations: getAnimationsForExport(),
                                };
                                await writeTextFile(
                                    sidecarPath,
                                    JSON.stringify(sidecar, null, 2),
                                );
                                messages.push(`Sidecar 已写出：${sidecarPath}`);
                            } catch (e: any) {
                                messages.push('写入 sidecar 失败：' + (e?.message || e));
                            }
                        }
                    }
                } catch (e: any) {
                    console.error('导出代码失败', e);
                    messages.push('导出代码失败：' + e.message);
                }
            }

            // 保存导出信息并显示结果面板
            exportResultMessages.value = messages;
            showExportResultPanel.value = true;
            message.value = messages.join('；');
        } catch (e: any) {
            console.error('导出失败', e);
            const errorMsg = '导出失败：' + e.message;
            exportResultMessages.value = [errorMsg];
            showExportResultPanel.value = true;
            message.value = errorMsg;
        }
    };

    // 重置导出配置为默认值
    const resetExportConfig = () => {
        exportResourcesEnabled.value = false;
        exportResourcesPath.value = '';
        exportCodeEnabled.value = true;
        exportCodePath.value = '';
        exportClassName.value = '';
        exportWriteSidecar.value = true;
    };

    return {
        showExportPanel,
        showExportResultPanel,
        exportResultMessages,
        exportResourcesEnabled,
        exportResourcesPath,
        exportCodeEnabled,
        exportCodePath,
        exportClassName,
        exportWriteSidecar,
        selectedExportPlugin,
        exportPlugins,
        showPluginEditor,
        pluginEditorContent,
        pluginEditorName,
        pluginEditorPath,
        selectExportResourcesPath,
        selectExportCodePath,
        doExport,
        resetExportConfig,
        loadCustomPlugin,
        createNewPlugin,
        editPlugin,
        savePluginEditor,
        deletePlugin,
        deletePluginById,
        showConfirmDialog,
        confirmDialogMessage,
        confirmDialogOk,
        confirmDialogCancel,
        openPluginWithDefaultEditor,
        showPluginDebugPanel,
        pluginDebugOutput,
        // 允许外部设置 currentProjectPath（可以是 ref 或函数）
        setCurrentProjectPath: (pathRef: CurrentProjectPathRef) => {
            currentProjectPathRef = pathRef;
        },
        getCurrentProjectPath: (): string | null => {
            return resolveCurrentProjectPath();
        },
    };
}
