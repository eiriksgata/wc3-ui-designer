// 导出插件系统类型定义

import type { Widget, ImageResource, Animation } from './index';

/**
 * 导出上下文 - 包含所有导出所需的参数和数据
 * 插件函数将接收此上下文作为参数
 */
export interface ExportContext {
    // 控件数据
    widgets: Widget[];
    
    // 资源数据
    imageResources: ImageResource[];
    
    // 动画数据（按控件 ID 分组）
    animations: Record<string, Omit<Animation, 'id' | 'widgetId'>[]>;
    
    // 项目设置
    settings: {
        canvasWidth: number;
        canvasHeight: number;
    };
    
    // 导出选项
    options: {
        // 项目文件名（用于生成类名等）
        fileName?: string;
        
        // 资源导出路径
        resourcePath?: string;
        
        // 代码导出路径（用于计算相对路径）
        codePath?: string;
        
        // 导出模式（可选，用于插件内部逻辑）
        mode?: string;
        
        // 其他自定义选项
        [key: string]: any;
    };
}

/**
 * 插件元数据 - 描述插件的基本信息
 */
export interface ExportPluginMetadata {
    // 插件唯一标识符
    id: string;
    
    // 插件显示名称
    name: string;
    
    // 插件描述
    description?: string;
    
    // 输出格式（如 'lua', 'typescript', 'jass' 等）
    outputFormat: string;
    
    // 插件版本
    version?: string;
    
    // 插件作者
    author?: string;
    
    // 插件类型
    type: 'builtin' | 'custom';
    
    // 插件文件路径（自定义插件）
    path?: string | null;
}

/**
 * 插件函数签名
 * 插件必须导出此函数，接收 ExportContext 并返回生成的代码字符串
 */
export type ExportPluginFunction = (context: ExportContext) => string;

/**
 * 插件模块接口
 * 插件文件必须导出此接口
 */
export interface ExportPluginModule {
    // 插件元数据
    metadata: ExportPluginMetadata;
    
    // 导出函数
    export: ExportPluginFunction;
}

/**
 * 插件注册信息（用于插件列表）
 */
export interface ExportPlugin extends ExportPluginMetadata {
    // 插件是否已加载
    loaded?: boolean;
    
    // 插件模块（如果已加载）
    module?: ExportPluginModule;
}

/**
 * 插件验证结果
 */
export interface PluginValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
}

