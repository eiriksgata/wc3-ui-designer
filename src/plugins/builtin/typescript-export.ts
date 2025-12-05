import type { ExportPluginModule, ExportContext } from '../../types/plugin';
import type { Widget } from '../../types';

/**
 * TypeScript 输出插件示例
 * 将 UI 设计器中的控件导出为 TypeScript 代码
 */

// 导出函数
function exportFunction(context: ExportContext): string {
    const { widgets, options, animations } = context;

    if (!widgets || widgets.length === 0) {
        return '';
    }


    // 使用项目名作为类名，默认 GeneratedUI
    const className = options.fileName || 'GeneratedUI';

    let ts = '';
    ts += '/**\n';
    ts += ' * 由 Vue UI 设计器自动生成\n';
    ts += ' * 你可以根据需要修改此文件\n';
    ts += ' */\n\n';

    // 导入语句
    ts += "import { Panel, Button, Text } from './ui-framework';\n\n";

    // 控件接口定义
    ts += 'interface WidgetConfig {\n';
    ts += '    id: number;\n';
    ts += '    name: string;\n';
    ts += '    type: string;\n';
    ts += '    x: number;\n';
    ts += '    y: number;\n';
    ts += '    w: number;\n';
    ts += '    h: number;\n';
    ts += '    text?: string;\n';
    ts += '    image?: string;\n';
    ts += '    children?: WidgetConfig[];\n';
    ts += '}\n\n';

    // 生成控件配置数组
    const generateWidgetConfig = (w: Widget, indent: number): string => {
        const pad = ' '.repeat(indent);
        let config = `${pad}{\n`;
        config += `${pad}    id: ${w.id},\n`;
        config += `${pad}    name: '${w.name}',\n`;
        config += `${pad}    type: '${w.type}',\n`;
        config += `${pad}    x: ${Math.round(w.x)},\n`;
        config += `${pad}    y: ${Math.round(w.y)},\n`;
        config += `${pad}    w: ${Math.round(w.w)},\n`;
        config += `${pad}    h: ${Math.round(w.h)},\n`;

        if (w.text && w.text.trim()) {
            config += `${pad}    text: '${w.text.replace(/'/g, "\\'")}',\n`;
        }

        if (w.image) {
            config += `${pad}    image: '${w.image.replace(/'/g, "\\'")}',\n`;
        }

        const children = widgets.filter((child) => child.parentId === w.id);
        if (children.length > 0) {
            config += `${pad}    children: [\n`;
            children.forEach((child, index) => {
                config += generateWidgetConfig(child, indent + 8);
                if (index < children.length - 1) {
                    config += ',\n';
                } else {
                    config += '\n';
                }
            });
            config += `${pad}    ],\n`;
        }

        config += `${pad}}`;
        return config;
    };

    // 类定义
    ts += `export class ${className} extends Panel {\n`;
    ts += '    private widgets: Map<number, any> = new Map();\n\n';

    ts += '    constructor() {\n';
    ts += '        super({\n';
    ts += '            x: 0,\n';
    ts += '            y: 0,\n';
    ts += '            w: 1920,\n';
    ts += '            h: 1080,\n';
    ts += '        });\n';
    ts += '        this.init();\n';
    ts += '    }\n\n';

    ts += '    private init(): void {\n';
    ts += '        const configs: WidgetConfig[] = [\n';

    // 只导出根节点
    const rootWidgets = widgets.filter((w) => w.parentId == null);
    rootWidgets.forEach((w, index) => {
        ts += generateWidgetConfig(w, 12);
        if (index < rootWidgets.length - 1) {
            ts += ',\n';
        } else {
            ts += '\n';
        }
    });

    ts += '        ];\n\n';
    ts += '        this.createWidgets(configs, this);\n';
    ts += '    }\n\n';

    ts += '    private createWidgets(configs: WidgetConfig[], parent: any): void {\n';
    ts += '        for (const config of configs) {\n';
    ts += '            let widget: any;\n';
    ts += '            switch (config.type) {\n';
    ts += "                case 'button':\n";
    ts += '                    widget = new Button(config);\n';
    ts += '                    break;\n';
    ts += "                case 'text':\n";
    ts += "                case 'label':\n";
    ts += '                    widget = new Text(config);\n';
    ts += '                    break;\n';
    ts += '                default:\n';
    ts += '                    widget = new Panel(config);\n';
    ts += '            }\n';
    ts += '            this.widgets.set(config.id, widget);\n';
    ts += '            parent.addChild(widget);\n';
    ts += '            if (config.children) {\n';
    ts += '                this.createWidgets(config.children, widget);\n';
    ts += '            }\n';
    ts += '        }\n';
    ts += '    }\n\n';

    // 动画数据
    const animMap = animations || {};
    const widgetIds = Object.keys(animMap);
    if (widgetIds.length > 0) {
        ts += '    // 动画数据（由编辑器导出，按控件 id 分组）\n';
        ts += '    public animations: Record<number, Array<{\n';
        ts += '        name: string;\n';
        ts += '        type: string;\n';
        ts += '        duration: number;\n';
        ts += '        delay: number;\n';
        ts += '        loop: boolean;\n';
        ts += '        params?: {\n';
        ts += '            toX?: number;\n';
        ts += '            toY?: number;\n';
        ts += '            tweenType?: number;\n';
        ts += '        };\n';
        ts += '    }>> = {\n';

        widgetIds.forEach((wid, index) => {
            const list = animMap[wid] || [];
            ts += `        ${wid}: [\n`;
            list.forEach((a, aIndex) => {
                ts += '            {\n';
                ts += `                name: '${a.name || ''}',\n`;
                ts += `                type: '${a.type || ''}',\n`;
                ts += `                duration: ${a.duration || 0},\n`;
                ts += `                delay: ${a.delay || 0},\n`;
                ts += `                loop: ${a.loop ? 'true' : 'false'},\n`;
                const p = a.params || {};
                if (p.toX !== undefined || p.toY !== undefined || p.tweenType !== undefined) {
                    ts += '                params: {\n';
                    if (p.toX !== undefined && p.toX !== null) {
                        ts += `                    toX: ${p.toX},\n`;
                    }
                    if (p.toY !== undefined && p.toY !== null) {
                        ts += `                    toY: ${p.toY},\n`;
                    }
                    if (p.tweenType !== undefined && p.tweenType !== null) {
                        ts += `                    tweenType: ${p.tweenType},\n`;
                    }
                    ts += '                },\n';
                }
                ts += '            }';
                if (aIndex < list.length - 1) {
                    ts += ',\n';
                } else {
                    ts += '\n';
                }
            });
            ts += '        }';
            if (index < widgetIds.length - 1) {
                ts += ',\n';
            } else {
                ts += '\n';
            }
        });

        ts += '    };\n\n';
    }

    ts += '    public getWidget(id: number): any {\n';
    ts += '        return this.widgets.get(id);\n';
    ts += '    }\n';
    ts += '}\n';

    return ts;
}

// 插件元数据
export const metadata = {
    id: 'typescript-export',
    name: 'TypeScript 导出插件',
    description: '将 UI 设计器中的控件导出为 TypeScript 代码',
    outputFormat: 'typescript',
    version: '1.0.0',
    type: 'builtin' as const,
};

// 导出插件模块
const plugin: ExportPluginModule = {
    metadata,
    export: exportFunction,
};

export default plugin;

