import type { ExportPluginModule, ExportContext } from '../../src/types/plugin';

/**
 * 示例插件：自定义导出格式
 * 
 * 此插件展示了如何创建一个自定义导出插件。
 * 插件必须导出 metadata 和 export 函数。
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
    code += `// 由 UI 设计器自动生成\n`;
    code += `// 类名: ${className}\n`;
    code += `// 画布尺寸: ${settings.canvasWidth}x${settings.canvasHeight}\n\n`;

    // 示例：遍历所有控件
    code += `// 控件列表\n`;
    code += `const widgets = [\n`;
    
    widgets.forEach((widget, index) => {
        code += `  {\n`;
        code += `    id: ${widget.id},\n`;
        code += `    name: '${widget.name}',\n`;
        code += `    type: '${widget.type}',\n`;
        code += `    x: ${widget.x},\n`;
        code += `    y: ${widget.y},\n`;
        code += `    w: ${widget.w},\n`;
        code += `    h: ${widget.h},\n`;
        if (widget.text) {
            code += `    text: '${widget.text.replace(/'/g, "\\'")}',\n`;
        }
        if (widget.image) {
            code += `    image: '${widget.image.replace(/'/g, "\\'")}',\n`;
        }
        code += `    parentId: ${widget.parentId ?? 'null'},\n`;
        code += `  }`;
        if (index < widgets.length - 1) {
            code += ',\n';
        } else {
            code += '\n';
        }
    });

    code += `];\n\n`;

    // 如果有动画数据
    const animMap = animations || {};
    const widgetIds = Object.keys(animMap);
    if (widgetIds.length > 0) {
        code += `// 动画数据\n`;
        code += `const animations = {\n`;
        widgetIds.forEach((wid, index) => {
            const list = animMap[wid] || [];
            code += `  ${wid}: [\n`;
            list.forEach((anim, aIndex) => {
                code += `    {\n`;
                code += `      name: '${anim.name || ''}',\n`;
                code += `      type: '${anim.type || ''}',\n`;
                code += `      duration: ${anim.duration || 0},\n`;
                code += `      delay: ${anim.delay || 0},\n`;
                code += `      loop: ${anim.loop ? 'true' : 'false'},\n`;
                code += `    }`;
                if (aIndex < list.length - 1) {
                    code += ',\n';
                } else {
                    code += '\n';
                }
            });
            code += `  }`;
            if (index < widgetIds.length - 1) {
                code += ',\n';
            } else {
                code += '\n';
            }
        });
        code += `};\n\n`;
    }

    code += `// 导出类\n`;
    code += `export class ${className} {\n`;
    code += `  constructor() {\n`;
    code += `    // 初始化代码\n`;
    code += `  }\n`;
    code += `}\n`;

    return code;
}

// 插件元数据
export const metadata = {
    id: 'example-plugin',
    name: '示例插件',
    description: '这是一个示例插件，展示了如何创建自定义导出插件',
    outputFormat: 'typescript',
    version: '1.0.0',
    author: 'UI Designer',
    type: 'custom' as const,
};

// 导出插件模块
const plugin: ExportPluginModule = {
    metadata,
    export: exportFunction,
};

export default plugin;

