import type { ExportPluginModule, ExportContext } from '../../types/plugin';
import type { Widget } from '../../types';

type WidgetTreeNode = Widget & {
    children: WidgetTreeNode[];
};

const cloneWidget = (widget: Widget): Widget => ({ ...widget });

const buildWidgetTree = (widgets: Widget[]): WidgetTreeNode[] => {
    const nodeMap = new Map<number, WidgetTreeNode>();
    const roots: WidgetTreeNode[] = [];

    widgets.forEach((widget) => {
        nodeMap.set(widget.id, {
            ...cloneWidget(widget),
            children: [],
        });
    });

    widgets.forEach((widget) => {
        const node = nodeMap.get(widget.id);
        if (!node) return;

        if (widget.parentId == null) {
            roots.push(node);
            return;
        }

        const parent = nodeMap.get(widget.parentId);
        if (parent) {
            parent.children.push(node);
        } else {
            roots.push(node);
        }
    });

    return roots;
};

function exportFunction(context: ExportContext): string {
    const { widgets, animations, imageResources, settings, options } = context;
    const exportedAt = new Date().toISOString();
    const projectName = options.fileName || 'GeneratedUI';

    const usedResourceValues = new Set<string>();
    widgets.forEach((widget) => {
        if (widget.image) usedResourceValues.add(widget.image);
        if (widget.clickImage) usedResourceValues.add(widget.clickImage);
        if (widget.hoverImage) usedResourceValues.add(widget.hoverImage);
    });

    const payload = {
        meta: {
            format: 'ui-designer-structured-json',
            version: '1.0.0',
            exportedAt,
            projectName,
        },
        settings: {
            canvasWidth: settings.canvasWidth,
            canvasHeight: settings.canvasHeight,
        },
        resources: imageResources.filter((resource) => usedResourceValues.has(resource.value)),
        widgets: {
            flat: widgets.map(cloneWidget),
            tree: buildWidgetTree(widgets),
        },
        animations,
    };

    return JSON.stringify(payload, null, 2);
}

export const metadata = {
    id: 'json-structured-export',
    name: '结构化 JSON 导出插件',
    description: '导出包含控件树、资源和动画的结构化 JSON 数据',
    outputFormat: 'json',
    version: '1.0.0',
    type: 'builtin' as const,
};

const plugin: ExportPluginModule = {
    metadata,
    export: exportFunction,
};

export default plugin;
