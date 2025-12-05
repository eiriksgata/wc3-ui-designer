import { ref, type Ref, onMounted } from 'vue';
import { open as tauriOpen, save as tauriSave } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { readFile, writeFile, writeTextFile, readTextFile, mkdir } from '@tauri-apps/plugin-fs';
import type { Widget, ImageResource, Animation, Settings } from '../types';
import type { ExportPlugin, ExportContext } from '../types/plugin';
import { usePluginSystem } from './usePluginSystem';

type CurrentProjectPathRef = Ref<string | null> | (() => string | null) | null;

export function useExport(
    widgetsList: Ref<Widget[]>,
    imageResources: Ref<ImageResource[]>,
    settings: Ref<Settings>,
    message: Ref<string>,
    saveProjectToFile: () => Promise<boolean>,
    getAnimationsForExport: () => Record<string, Omit<Animation, 'id'>[]>,
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

    // 插件系统
    const pluginSystem = usePluginSystem();
    const selectedExportPlugin = ref<string>('lua-export'); // 默认使用 Lua 导出插件
    const exportPlugins = pluginSystem.plugins;

    // 插件编辑器
    const showPluginEditor = ref(false);
    const pluginEditorContent = ref('');
    const pluginEditorName = ref('');
    const pluginEditorPath = ref('');

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
        if (!currentProjectPathRef) return 'GeneratedUI';
        const path =
            typeof currentProjectPathRef === 'function'
                ? currentProjectPathRef()
                : (currentProjectPathRef.value || currentProjectPathRef);
        if (!path) return 'GeneratedUI';
        const fileName = path.split(/[/\\]/).pop() || '';
        const base = fileName.replace(/\.(uiproj|json)$/i, '');
        return base || 'GeneratedUI';
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

        // 构建导出上下文
        const context: ExportContext = {
            widgets,
            imageResources: imageResources.value,
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
            // 导出资源
            if (exportResourcesEnabled.value) {
                if (!exportResourcesPath.value) {
                    messages.push('请选择资源导出路径');
                } else {
                    try {
                        // 确保目录存在
                        await mkdir(exportResourcesPath.value, { recursive: true });

                        // 收集所有控件中使用的资源路径
                        const usedResourceValues = new Set<string>();
                        widgetsList.value.forEach(w => {
                            if (w.image && w.image.trim()) {
                                usedResourceValues.add(w.image);
                            }
                        });

                        // 只导出被使用的资源（且有 localPath 的资源）
                        const allResources = imageResources.value || [];
                        const resources = allResources.filter(r =>
                            usedResourceValues.has(r.value) &&
                            r.localPath &&
                            r.localPath.trim()
                        );

                        if (usedResourceValues.size === 0) {
                            messages.push('没有控件使用资源，无需导出');
                        } else if (resources.length === 0) {
                            messages.push(`有 ${usedResourceValues.size} 个资源被使用，但这些资源没有本地路径，无法导出`);
                        } else {
                            let copiedCount = 0;
                            const errors: string[] = [];

                            for (const res of resources) {
                                try {
                                    const fileName = res.localPath.split(/[/\\]/).pop();
                                    if (!fileName) {
                                        errors.push(`资源 ${res.label} 的文件名无效`);
                                        continue;
                                    }
                                    const sep = exportResourcesPath.value.includes('\\') ? '\\' : '/';
                                    const destPath = `${exportResourcesPath.value}${sep}${fileName}`;

                                    // 读取源文件并写入目标文件
                                    try {
                                        const fileData = await readFile(res.localPath);
                                        await writeFile(destPath, fileData);
                                        copiedCount++;
                                    } catch (readErr: any) {
                                        errors.push(`资源 ${res.label} 的源文件不存在或无法读取: ${res.localPath}`);
                                        continue;
                                    }
                                } catch (e: any) {
                                    console.error('复制资源文件失败:', res.label, res.localPath, e);
                                    errors.push(`资源 ${res.label} 复制失败: ${e.message}`);
                                }
                            }

                            if (copiedCount > 0) {
                                messages.push(`已导出 ${copiedCount}/${resources.length} 个使用的资源到：${exportResourcesPath.value}`);
                            }
                            if (errors.length > 0) {
                                messages.push(`部分资源导出失败：${errors.slice(0, 3).join('; ')}${errors.length > 3 ? '...' : ''}`);
                            }
                            if (copiedCount === 0 && errors.length > 0) {
                                messages.push('所有资源导出失败，请检查资源路径是否正确');
                            }
                            // 提示未导出的资源
                            const notExported = usedResourceValues.size - resources.length;
                            if (notExported > 0) {
                                messages.push(`注意：有 ${notExported} 个使用的资源没有本地路径，未导出`);
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
                            ? (typeof currentProjectPathRef === 'function' ? currentProjectPathRef() : (currentProjectPathRef.value || currentProjectPathRef))
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
    };

    return {
        showExportPanel,
        showExportResultPanel,
        exportResultMessages,
        exportResourcesEnabled,
        exportResourcesPath,
        exportCodeEnabled,
        exportCodePath,
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
            if (!currentProjectPathRef) return null;
            return typeof currentProjectPathRef === 'function' ? currentProjectPathRef() : (currentProjectPathRef.value || currentProjectPathRef);
        },
    };
}
