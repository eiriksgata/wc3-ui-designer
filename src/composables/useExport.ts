import { ref, type Ref } from 'vue';
import { open as tauriOpen, save as tauriSave } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { readFile, writeFile, writeTextFile, readTextFile, mkdir } from '@tauri-apps/plugin-fs';
import type { Widget, ImageResource, Animation } from '../types';

interface ExportPlugin {
    id: string;
    name: string;
    type: 'builtin' | 'custom';
    path: string | null;
}

type CurrentProjectPathRef = Ref<string | null> | (() => string | null) | null;

export function useExport(
    widgetsList: Ref<Widget[]>,
    imageResources: Ref<ImageResource[]>,
    exportLuaFn: (widgets: Widget[], options?: any) => string | undefined,
    message: Ref<string>,
    saveProjectToFile: () => Promise<boolean>, // 添加保存项目的函数
    getAnimationsForExport: () => Record<string, Omit<Animation, 'id'>[]>, // 新增：获取动画导出数据的函数
) {
    // currentProjectPath 将在外部设置（可以是 ref 或函数）
    let currentProjectPathRef: CurrentProjectPathRef = null;
    const showExportPanel = ref(false);
    const showExportResultPanel = ref(false);
    const exportResultMessages = ref<string[]>([]);
    const showLuaDebugPanel = ref(false);
    const luaDebugOutput = ref('');
    const exportResourcesEnabled = ref(false);
    const exportResourcesPath = ref('');
    const exportLuaEnabled = ref(true);
    const exportLuaPath = ref('');
    const exportPluginEnabled = ref(false);
    const exportPluginPath = ref('');

    // 插件系统
    const selectedExportPlugin = ref('default'); // 默认使用内置插件
    const exportPlugins = ref<ExportPlugin[]>([
        {
            id: 'default',
            name: '默认导出插件',
            type: 'builtin', // builtin 或 custom
            path: null, // 自定义插件的文件路径
        }
    ]);
    const showPluginEditor = ref(false);
    const pluginEditorContent = ref('');
    const pluginEditorName = ref('');
    const pluginEditorPath = ref('');

    // 确认对话框状态
    const showConfirmDialog = ref(false);
    const confirmDialogMessage = ref('');
    const confirmDialogCallback = ref<((confirmed: boolean) => void) | null>(null);

    // 生成默认插件的 Lua 5.4 代码
    const getDefaultPluginCode = (): string => {
        return `-- 默认导出插件 (Lua 5.4)
-- 此插件定义了如何将 UI 设计器中的控件导出为 Lua 代码
-- 参数:
--   widgets: 控件列表
--   options: 导出选项 { resourcePath, luaPath, mode, fileName }
-- 返回: 生成的 Lua 代码字符串

local function getRelativePath(fromPath, toPath)
    if not fromPath or not toPath then
        return toPath
    end
    
    local function normalize(path)
        path = path:gsub("\\\\", "/")
        if path:sub(-1) == "/" and #path > 1 then
            path = path:sub(1, -2)
        end
        return path
    end
    
    local from = normalize(fromPath)
    local to = normalize(toPath)
    
    local fromDir = from:match("^(.*)/") or ""
    local toDir = to:match("^(.*)/") or ""
    local toFileName = to:match("/([^/]+)$") or to
    
    if fromDir ~= toDir then
        local fromParts = {}
        for part in fromDir:gmatch("([^/]+)") do
            table.insert(fromParts, part)
        end
        
        local toParts = {}
        for part in toDir:gmatch("([^/]+)") do
            table.insert(toParts, part)
        end
        
        local commonLength = 0
        local minLength = math.min(#fromParts, #toParts)
        while commonLength < minLength and
              fromParts[commonLength + 1]:lower() == toParts[commonLength + 1]:lower() do
            commonLength = commonLength + 1
        end
        
        local upLevels = #fromParts - commonLength
        local relativePath = ""
        if upLevels > 0 then
            relativePath = string.rep("../", upLevels)
        end
        
        for i = commonLength + 1, #toParts do
            relativePath = relativePath .. toParts[i] .. "/"
        end
        
        relativePath = relativePath .. toFileName
        return relativePath:gsub("/", "\\\\")
    end
    
    return toFileName
end

local function convertImagePath(imagePath, resourcePath, luaPath)
    if not imagePath or not resourcePath or not luaPath then
        return imagePath
    end
    
    local fileName = imagePath:match("([^/\\\\]+)$") or imagePath
    local sep = resourcePath:find("\\\\") and "\\\\" or "/"
    local resourceFile = resourcePath .. (resourcePath:sub(-1) == "/" or resourcePath:sub(-1) == "\\\\" and "" or sep) .. fileName
    
    return getRelativePath(luaPath, resourceFile)
end

return function(widgets, options)
    if not widgets or #widgets == 0 then
        return ""
    end
    
    local lua = ""
    lua = lua .. "-- 由 Vue UI 设计器自动生成\\n"
    lua = lua .. "-- 你可以根据需要改名 / 增加逻辑\\n\\n"
    lua = lua .. "---@class GeneratedUI:Frame.Panel\\n"
    lua = lua .. "---@field new fun():GeneratedUI\\n"
    lua = lua .. "GeneratedUI = Class('GeneratedUI', Frame.Panel)\\n\\n"
    lua = lua .. "function GeneratedUI:ctor()\\n"
    lua = lua .. "    Frame.Panel.ctor(self, {\\n"
    lua = lua .. "        parent = Frame.GameUI,\\n"
    lua = lua .. "        x = 0,\\n"
    lua = lua .. "        y = 0,\\n"
    lua = lua .. "        w = 1920,\\n"
    lua = lua .. "        h = 1080,\\n"
    lua = lua .. "        image = Const.Texture.blank,\\n"
    lua = lua .. "        -- 以下子控件由设计器生成\\n"
    
    local function emitWidget(w, indent)
        local pad = string.rep(" ", indent)
        local luaType = "Panel"
        if w.type == "label" or w.type == "input" then
            luaType = "Text"
        elseif w.type == "button" then
            luaType = "Button"
        end
        
        lua = lua .. pad .. "{\\n"
        lua = lua .. pad .. "    name = '" .. (w.name or "") .. "',\\n"
        lua = lua .. pad .. "    type = '" .. luaType .. "',\\n"
        lua = lua .. pad .. "    x = " .. math.floor(w.x or 0) .. ",\\n"
        lua = lua .. pad .. "    y = " .. math.floor(w.y or 0) .. ",\\n"
        lua = lua .. pad .. "    w = " .. math.floor(w.w or 0) .. ",\\n"
        lua = lua .. pad .. "    h = " .. math.floor(w.h or 0) .. ",\\n"
        lua = lua .. pad .. "    text = [[" .. (w.text or "") .. "]],\\n"
        
        if w.image then
            local imagePath = w.image
            if options and options.resourcePath and options.luaPath then
                imagePath = convertImagePath(w.image, options.resourcePath, options.luaPath)
            end
            lua = lua .. pad .. "    image = [[" .. imagePath .. "]],\\n"
        end
        
        if w.type == "checkbox" then
            lua = lua .. pad .. "    checked = " .. (w.checked and "true" or "false") .. ",\\n"
        end
        if w.type == "combobox" then
            lua = lua .. pad .. "    selected_index = " .. (w.selectedIndex or 0) .. ",\\n"
        end
        
        -- 处理子控件
        local children = {}
        for _, child in ipairs(widgets) do
            if child.parentId == w.id then
                table.insert(children, child)
            end
        end
        
        if #children > 0 then
            lua = lua .. pad .. "    -- children\\n"
            for _, child in ipairs(children) do
                emitWidget(child, indent + 4)
            end
        end
        
        lua = lua .. pad .. "},\\n"
    end
    
    -- 只导出根节点
    for _, w in ipairs(widgets) do
        if not w.parentId then
            emitWidget(w, 8)
        end
    end
    
    lua = lua .. "    })\\n"
    lua = lua .. "end\\n\\n"
    
    return lua
end`;
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
                // 立即保存导出配置
                await saveExportConfig();
            }
        } catch (e) {
            console.error('选择资源导出路径失败', e);
            message.value = '选择路径失败';
        }
    };

    // 选择 Lua 导出路径
    const selectExportLuaPath = async () => {
        try {
            const baseName = getProjectBaseName();
            const selected = await tauriSave({
                title: '保存 Lua 文件',
                filters: [
                    { name: 'Lua 文件', extensions: ['lua'] },
                ],
                defaultPath: `${baseName}.lua`,
            });
            if (selected) {
                exportLuaPath.value = selected;
                // 立即保存导出配置
                await saveExportConfig();
            }
        } catch (e) {
            console.error('选择 Lua 导出路径失败', e);
            message.value = '选择路径失败';
        }
    };

    // 选择插件导出路径
    const selectExportPluginPath = async () => {
        try {
            const selected = await tauriSave({
                title: '保存插件文件',
                filters: [
                    { name: 'Lua 文件', extensions: ['lua'] },
                ],
                defaultPath: 'UIPlugin.lua',
            });
            if (selected) {
                exportPluginPath.value = selected;
                // 立即保存导出配置
                await saveExportConfig();
            }
        } catch (e) {
            console.error('选择插件导出路径失败', e);
            message.value = '选择路径失败';
        }
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

    // 使用选中的插件生成 Lua 代码
    const generateLuaWithPlugin = async (widgets: Widget[], options: any = {}): Promise<string> => {
        if (!widgets || widgets.length === 0) {
            return '';
        }

        const pluginId = selectedExportPlugin.value;
        const plugin = exportPlugins.value.find(p => p.id === pluginId);

        if (!plugin) {
            // 如果没有找到插件，使用默认导出逻辑
            return exportLuaFn(widgets, options) || '';
        }

        if (plugin.type === 'builtin' && plugin.id === 'default') {
            // 使用默认插件（现有的导出逻辑）
            return exportLuaFn(widgets, options) || '';
        }

        if (plugin.type === 'custom' && plugin.path) {
            // 使用自定义插件：通过 Rust 调用 lua54.exe 执行
            try {
                const result = await invoke<string>('execute_lua_plugin', {
                    pluginPath: plugin.path,
                    widgets: widgets,
                    options: options || {},
                });
                // 清空调试输出（成功时）
                luaDebugOutput.value = '';
                return result || '';
            } catch (e: any) {
                console.error('执行自定义插件失败', e);
                // 显示详细的错误信息到调试面板
                const errorMsg = e.message || String(e);
                luaDebugOutput.value = `Lua 插件执行错误:\n${errorMsg}\n\n请检查:\n1. 插件文件语法是否正确\n2. 插件是否返回一个函数\n3. 插件函数是否正确处理 widgets 和 options 参数`;
                showLuaDebugPanel.value = true;
                message.value = '执行自定义插件失败，请查看调试输出';
                return exportLuaFn(widgets, options) || '';
            }
        }

        return exportLuaFn(widgets, options) || '';
    };


    // 生成插件 Lua 代码（用于导出插件文件）
    const generatePluginLua = async (resourcePath: string, pluginPath: string): Promise<string> => {
        if (!widgetsList.value.length) {
            return '';
        }

        // 使用选中的插件生成代码
        const exportOptions: any = { mode: 'string' };
        if (resourcePath && pluginPath) {
            exportOptions.resourcePath = resourcePath;
            exportOptions.luaPath = pluginPath;
        }
        // 使用项目文件名作为类名（xxx.uiproj -> xxx）
        exportOptions.fileName = getProjectBaseName();

        // 如果提供了动画导出函数，也把动画数据传给插件示例
        if (getAnimationsForExport) {
            exportOptions.animations = getAnimationsForExport();
        }

        const uiLua = await generateLuaWithPlugin(widgetsList.value, exportOptions) || '';

        if (!uiLua) {
            return '';
        }

        let lua = '';
        lua += '-- UI 设计器生成的插件文件\n';
        lua += '-- 此插件包含 UI 布局定义\n\n';
        lua += 'local Plugin = {}\n\n';
        lua += 'function Plugin:OnLoad()\n';
        lua += '    -- 加载 UI 布局\n';
        lua += '    self:LoadUI()\n';
        lua += 'end\n\n';
        lua += 'function Plugin:LoadUI()\n';
        lua += '    -- 由设计器生成的 UI 代码\n';

        // 提取 Frame.Panel.ctor 调用及其内容
        const lines = uiLua.split('\n');
        let startIndex = -1;
        let endIndex = -1;

        // 找到 Frame.Panel.ctor 的开始位置
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes('Frame.Panel.ctor(self, {')) {
                startIndex = i;
                break;
            }
        }

        // 找到对应的结束位置（})））
        if (startIndex >= 0) {
            let braceCount = 0;
            for (let i = startIndex; i < lines.length; i++) {
                const line = lines[i];
                if (line.includes('{')) braceCount++;
                if (line.includes('}')) braceCount--;
                if (braceCount === 0 && line.includes('}')) {
                    endIndex = i;
                    break;
                }
            }
        }

        // 提取并添加代码，每行前面加4个空格缩进
        if (startIndex >= 0 && endIndex >= 0) {
            for (let i = startIndex; i <= endIndex; i++) {
                lua += '    ' + lines[i] + '\n';
            }
        }

        lua += 'end\n\n';
        lua += 'return Plugin\n';

        return lua;
    };

    // 加载自定义插件
    const loadCustomPlugin = async () => {
        try {
            const selected = await tauriOpen({
                title: '选择导出插件文件',
                filters: [
                    { name: 'Lua 文件', extensions: ['lua'] },
                ],
                multiple: false,
            });
            if (selected) {
                const pluginPath = Array.isArray(selected) ? selected[0] : selected;
                const pluginContent = await readTextFile(pluginPath);

                // 从文件路径提取插件名称
                const fileName = pluginPath.split(/[/\\]/).pop()?.replace(/\.lua$/, '') || '';

                // 添加到插件列表
                const newPlugin: ExportPlugin = {
                    id: `custom_${Date.now()}`,
                    name: fileName,
                    type: 'custom',
                    path: pluginPath,
                };
                exportPlugins.value.push(newPlugin);
                selectedExportPlugin.value = newPlugin.id;
                await saveExportConfig();
                message.value = `已加载插件：${fileName}`;
            }
        } catch (e) {
            console.error('加载插件失败', e);
            message.value = '加载插件失败';
        }
    };

    // 创建新插件
    const createNewPlugin = () => {
        pluginEditorName.value = '新插件';
        pluginEditorContent.value = getDefaultPluginCode();
        pluginEditorPath.value = '';
        showPluginEditor.value = true;
    };

    // 编辑插件
    const editPlugin = async (pluginId: string) => {
        const plugin = exportPlugins.value.find(p => p.id === pluginId);
        if (!plugin) return;

        if (plugin.type === 'builtin') {
            pluginEditorName.value = plugin.name;
            pluginEditorContent.value = getDefaultPluginCode();
            pluginEditorPath.value = '';
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
                        { name: 'Lua 文件', extensions: ['lua'] },
                    ],
                    defaultPath: `${pluginEditorName.value}.lua`,
                });
                if (!selected) return;
                pluginPath = selected;
            }

            await writeTextFile(pluginPath, pluginEditorContent.value);

            // 更新或添加插件到列表
            if (pluginEditorPath.value) {
                // 编辑现有插件
                const plugin = exportPlugins.value.find(p => p.path === pluginEditorPath.value);
                if (plugin) {
                    plugin.name = pluginEditorName.value;
                    plugin.path = pluginPath;
                }
            } else {
                // 新建插件
                const newPlugin: ExportPlugin = {
                    id: `custom_${Date.now()}`,
                    name: pluginEditorName.value,
                    type: 'custom',
                    path: pluginPath,
                };
                exportPlugins.value.push(newPlugin);
                selectedExportPlugin.value = newPlugin.id;
            }

            pluginEditorPath.value = pluginPath;
            showPluginEditor.value = false;
            await saveExportConfig();
            message.value = '插件已保存';
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
        const plugin = exportPlugins.value.find(p => p.id === pluginId);

        if (!plugin) {
            message.value = '未找到要删除的插件';
            return;
        }

        // 不能删除默认插件
        if (plugin.type === 'builtin' || plugin.id === 'default') {
            message.value = '不能删除默认插件';
            return;
        }

        // 显示确认对话框
        showConfirm(`确定要删除插件 "${plugin.name}" 吗？`, (confirmed) => {
            if (!confirmed) {
                return;
            }

            // 从列表中移除
            const index = exportPlugins.value.findIndex(p => p.id === pluginId);
            if (index !== -1) {
                exportPlugins.value.splice(index, 1);
            }

            // 如果删除的是当前选中的插件，切换到默认插件
            if (selectedExportPlugin.value === pluginId) {
                selectedExportPlugin.value = 'default';
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
        if (!exportResourcesEnabled.value && !exportLuaEnabled.value) {
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

                                    // 读取源文件并写入目标文件（避免 copyFile 权限问题）
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

            // 导出 Lua
            if (exportLuaEnabled.value) {
                try {
                    // 确定 Lua 文件路径
                    let luaFilePath = exportLuaPath.value;
                    if (!luaFilePath) {
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
                            luaFilePath = `${dir}${sep}${baseName}.lua`;
                        } else {
                            const selected = await tauriSave({
                                title: '保存 Lua 文件',
                                filters: [
                                    { name: 'Lua 文件', extensions: ['lua'] },
                                ],
                                defaultPath: 'GeneratedUI.lua',
                            });
                            if (!selected) {
                                messages.push('Lua 导出已取消');
                                return;
                            }
                            luaFilePath = selected;
                        }
                    }

                    // 如果同时导出了资源，传递资源路径和Lua路径进行路径转换
                    const exportOptions: any = { mode: 'string' };
                    if (exportResourcesEnabled.value && exportResourcesPath.value && luaFilePath) {
                        exportOptions.resourcePath = exportResourcesPath.value;
                        exportOptions.luaPath = luaFilePath;
                    }
                    // 导出的类名使用当前项目名（xxx.uiproj -> xxx）
                    exportOptions.fileName = getProjectBaseName();

                    // 传递动画数据给导出逻辑 / 自定义插件
                    if (getAnimationsForExport) {
                        exportOptions.animations = getAnimationsForExport();
                    }

                    const lua = await generateLuaWithPlugin(widgetsList.value, exportOptions) || '';
                    if (!lua) {
                        messages.push('Lua 导出内容为空');
                    } else {
                        await writeTextFile(luaFilePath, lua);
                        messages.push(`Lua 已导出到：${luaFilePath}`);
                        // 导出成功后，尝试向 war3.exe 发送一个 F4 热键
                        try {
                            await invoke('send_f4_to_war3');
                        } catch (e) {
                            console.warn('发送 F4 到 war3.exe 失败:', e);
                        }
                    }
                } catch (e: any) {
                    console.error('导出 Lua 失败', e);
                    messages.push('导出 Lua 失败：' + e.message);
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
        exportLuaEnabled.value = true;
        exportLuaPath.value = '';
        exportPluginEnabled.value = false;
        exportPluginPath.value = '';
    };

    return {
        showExportPanel,
        showExportResultPanel,
        exportResultMessages,
        exportResourcesEnabled,
        exportResourcesPath,
        exportLuaEnabled,
        exportLuaPath,
        exportPluginEnabled,
        exportPluginPath,
        selectedExportPlugin,
        exportPlugins,
        showPluginEditor,
        pluginEditorContent,
        pluginEditorName,
        pluginEditorPath,
        selectExportResourcesPath,
        selectExportLuaPath,
        selectExportPluginPath,
        generatePluginLua,
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
        showLuaDebugPanel,
        luaDebugOutput,
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

