import { ref, type Ref } from 'vue';
import type {
    ExportPlugin,
    ExportPluginModule,
    ExportPluginFunction,
    ExportContext,
    PluginValidationResult,
} from '../types/plugin';

/**
 * 插件系统核心 Composable
 * 负责插件的加载、执行、验证和扫描
 */
export function usePluginSystem() {
    const plugins = ref<ExportPlugin[]>([]);
    const loadingPlugins = ref<Set<string>>(new Set());
    const pluginErrors = ref<Map<string, string>>(new Map());

    /**
     * 验证插件模块格式
     */
    const validatePlugin = (module: any): PluginValidationResult => {
        const errors: string[] = [];
        const warnings: string[] = [];

        // 检查是否导出 metadata
        if (!module.metadata) {
            errors.push('插件必须导出 metadata 对象');
        } else {
            // 验证 metadata 必需字段
            if (!module.metadata.id) {
                errors.push('metadata 必须包含 id 字段');
            }
            if (!module.metadata.name) {
                errors.push('metadata 必须包含 name 字段');
            }
            if (!module.metadata.outputFormat) {
                errors.push('metadata 必须包含 outputFormat 字段');
            }
            if (!module.metadata.type) {
                errors.push('metadata 必须包含 type 字段');
            }
        }

        // 检查是否导出 export 函数
        if (!module.export) {
            errors.push('插件必须导出 export 函数');
        } else if (typeof module.export !== 'function') {
            errors.push('export 必须是一个函数');
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings,
        };
    };

    /**
     * 加载单个插件
     */
    const loadPlugin = async (pluginPath: string): Promise<ExportPluginModule | null> => {
        try {
            // 使用动态 import 加载插件
            // 注意：在 Vite 中，路径需要相对于项目根目录或使用别名
            const module = await import(/* @vite-ignore */ pluginPath);

            // 验证插件格式
            const validation = validatePlugin(module);
            if (!validation.valid) {
                const errorMsg = `插件验证失败：\n${validation.errors.join('\n')}`;
                pluginErrors.value.set(pluginPath, errorMsg);
                console.error('插件验证失败:', pluginPath, validation.errors);
                return null;
            }

            // 清除之前的错误
            pluginErrors.value.delete(pluginPath);

            return module as ExportPluginModule;
        } catch (error: any) {
            const errorMsg = `加载插件失败：${error.message || String(error)}`;
            pluginErrors.value.set(pluginPath, errorMsg);
            console.error('加载插件失败:', pluginPath, error);
            return null;
        }
    };

    /**
     * 执行插件
     */
    const executePlugin = async (
        plugin: ExportPlugin,
        context: ExportContext
    ): Promise<string> => {
        // 如果插件未加载，先加载
        if (!plugin.module) {
            if (!plugin.path) {
                throw new Error(`插件 ${plugin.name} 没有指定路径`);
            }

            loadingPlugins.value.add(plugin.id);
            try {
                const module = await loadPlugin(plugin.path);
                if (!module) {
                    throw new Error(`无法加载插件 ${plugin.name}`);
                }
                plugin.module = module;
                plugin.loaded = true;
            } finally {
                loadingPlugins.value.delete(plugin.id);
            }
        }

        // 执行插件函数
        if (!plugin.module || !plugin.module.export) {
            throw new Error(`插件 ${plugin.name} 没有有效的导出函数`);
        }

        try {
            const result = plugin.module.export(context);
            if (typeof result !== 'string') {
                throw new Error(`插件 ${plugin.name} 的 export 函数必须返回字符串`);
            }
            return result;
        } catch (error: any) {
            const errorMsg = `执行插件失败：${error.message || String(error)}`;
            pluginErrors.value.set(plugin.id, errorMsg);
            throw new Error(errorMsg);
        }
    };

    /**
     * 扫描内置插件目录
     */
    const scanBuiltinPlugins = async (): Promise<ExportPlugin[]> => {
        const builtinPlugins: ExportPlugin[] = [];

        try {
            // 使用 Vite 的 glob 导入功能扫描内置插件
            // 注意：这需要在构建时确定，所以我们需要手动列出插件
            const pluginModules = import.meta.glob('../plugins/builtin/*.ts', { eager: false });

            for (const path in pluginModules) {
                try {
                    const module = await pluginModules[path]() as any;
                    if (module && module.metadata) {
                        const plugin: ExportPlugin = {
                            ...module.metadata,
                            type: 'builtin',
                            path: path,
                            loaded: true,
                            module: module as ExportPluginModule,
                        };
                        builtinPlugins.push(plugin);
                    }
                } catch (error) {
                    console.warn(`加载内置插件失败: ${path}`, error);
                }
            }
        } catch (error) {
            console.warn('扫描内置插件失败:', error);
        }

        return builtinPlugins;
    };

    /**
     * 从文件路径加载自定义插件
     * 注意：由于浏览器安全限制，插件文件必须放在 plugins/custom/ 目录才能被动态加载
     * 此函数主要用于验证和注册插件信息
     */
    const loadCustomPluginFromPath = async (filePath: string): Promise<ExportPlugin | null> => {
        try {
            // 读取文件内容进行验证
            const { readTextFile } = await import('@tauri-apps/plugin-fs');
            const content = await readTextFile(filePath);

            // 尝试解析插件元数据（简单验证）
            // 注意：完整的加载需要通过 scanCustomPlugins 扫描 plugins/custom/ 目录
            const fileName = filePath.split(/[/\\]/).pop()?.replace(/\.ts$/, '') || 'custom-plugin';

            // 返回插件信息（实际加载需要文件在 plugins/custom/ 目录）
            const plugin: ExportPlugin = {
                id: `custom_${Date.now()}`,
                name: fileName,
                description: '自定义插件',
                outputFormat: 'custom',
                type: 'custom',
                path: filePath,
                loaded: false,
            };

            return plugin;
        } catch (error: any) {
            console.error('从路径加载插件失败:', filePath, error);
            return null;
        }
    };

    /**
     * 扫描自定义插件目录
     */
    const scanCustomPlugins = async (): Promise<ExportPlugin[]> => {
        const customPlugins: ExportPlugin[] = [];

        try {
            // 扫描 plugins/custom/ 目录（如果存在）
            const pluginModules = import.meta.glob('../plugins/custom/*.ts', { eager: false });

            for (const path in pluginModules) {
                try {
                    const module = await pluginModules[path]() as any;
                    if (module && module.metadata) {
                        const plugin: ExportPlugin = {
                            ...module.metadata,
                            type: 'custom',
                            path: path,
                            loaded: true,
                            module: module as ExportPluginModule,
                        };
                        customPlugins.push(plugin);
                    }
                } catch (error) {
                    console.warn(`加载自定义插件失败: ${path}`, error);
                }
            }
        } catch (error) {
            console.warn('扫描自定义插件失败:', error);
        }

        return customPlugins;
    };

    /**
     * 初始化插件系统 - 扫描并加载所有可用插件
     */
    const initializePlugins = async (): Promise<void> => {
        const builtinPlugins = await scanBuiltinPlugins();
        const customPlugins = await scanCustomPlugins();

        plugins.value = [...builtinPlugins, ...customPlugins];
    };

    /**
     * 根据 ID 获取插件
     */
    const getPluginById = (id: string): ExportPlugin | undefined => {
        return plugins.value.find(p => p.id === id);
    };

    /**
     * 添加插件（用于运行时添加）
     */
    const addPlugin = (plugin: ExportPlugin): void => {
        // 检查是否已存在
        const existing = plugins.value.find(p => p.id === plugin.id);
        if (existing) {
            console.warn(`插件 ${plugin.id} 已存在，将被替换`);
            const index = plugins.value.indexOf(existing);
            plugins.value[index] = plugin;
        } else {
            plugins.value.push(plugin);
        }
    };

    /**
     * 移除插件
     */
    const removePlugin = (id: string): boolean => {
        const index = plugins.value.findIndex(p => p.id === id);
        if (index !== -1) {
            plugins.value.splice(index, 1);
            pluginErrors.value.delete(id);
            return true;
        }
        return false;
    };

    /**
     * 获取插件错误信息
     */
    const getPluginError = (pluginId: string): string | undefined => {
        return pluginErrors.value.get(pluginId);
    };

    return {
        plugins,
        loadingPlugins,
        pluginErrors,
        loadPlugin,
        executePlugin,
        validatePlugin,
        scanBuiltinPlugins,
        scanCustomPlugins,
        loadCustomPluginFromPath,
        initializePlugins,
        getPluginById,
        addPlugin,
        removePlugin,
        getPluginError,
    };
}

