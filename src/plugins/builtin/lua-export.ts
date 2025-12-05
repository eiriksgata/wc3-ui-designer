import type { ExportPluginModule, ExportContext } from '../../types/plugin';
import type { Widget } from '../../types';

/**
 * Lua 输出插件
 * 将 UI 设计器中的控件导出为 Lua 代码（Frame UI 框架格式）
 */

// 计算相对路径（从 fromPath 到 toPath）
function getRelativePath(fromPath: string, toPath: string): string {
    if (!fromPath || !toPath) return toPath;

    // 标准化路径分隔符为统一格式
    const normalize = (path: string): string => {
        // 处理 Windows 路径（如 C:\Users\...）
        let normalized = path.replace(/\\/g, '/');
        // 移除末尾的斜杠（如果有）
        if (normalized.endsWith('/') && normalized.length > 1) {
            normalized = normalized.slice(0, -1);
        }
        return normalized;
    };

    const from = normalize(fromPath);
    const to = normalize(toPath);

    // 提取目录部分（去掉文件名）
    const fromDir = from.substring(0, from.lastIndexOf('/') + 1);
    const toDir = to.substring(0, to.lastIndexOf('/') + 1);
    const toFileName = to.substring(to.lastIndexOf('/') + 1);

    // 如果不在同一目录，计算相对路径
    if (fromDir !== toDir) {
        const fromParts = fromDir.split('/').filter(p => p && p !== '.');
        const toParts = toDir.split('/').filter(p => p && p !== '.');

        // 找到共同前缀（忽略大小写，因为Windows路径不区分大小写）
        let commonLength = 0;
        const minLength = Math.min(fromParts.length, toParts.length);
        while (commonLength < minLength &&
            fromParts[commonLength].toLowerCase() === toParts[commonLength].toLowerCase()) {
            commonLength++;
        }

        // 计算需要向上几级
        const upLevels = fromParts.length - commonLength;
        const downParts = toParts.slice(commonLength);

        // 构建相对路径
        let relativePath = '';
        if (upLevels > 0) {
            relativePath = '../'.repeat(upLevels);
        }
        if (downParts.length > 0) {
            relativePath += downParts.join('/') + '/';
        }
        relativePath += toFileName;

        // 转换为 Windows 路径格式（使用反斜杠）
        return relativePath.replace(/\//g, '\\');
    }

    // 同一目录，直接返回文件名
    return toFileName;
}

// 转换图片路径
function convertImagePath(imagePath: string, resourcePath: string, codePath: string): string {
    if (!imagePath || !resourcePath || !codePath) {
        return imagePath; // 如果缺少参数，返回原路径
    }

    // 从 imagePath 中提取文件名（可能是完整路径或只是文件名）
    const fileName = imagePath.split(/[/\\]/).pop() || '';

    // 构建资源文件的完整路径
    const sep = resourcePath.includes('\\') ? '\\' : '/';
    const resourceFile = resourcePath + (resourcePath.endsWith('/') || resourcePath.endsWith('\\') ? '' : sep) + fileName;

    // 计算资源文件相对于代码文件的路径
    const relativePath = getRelativePath(codePath, resourceFile);

    return relativePath;
}

// 导出函数
function exportFunction(context: ExportContext): string {
    const { widgets, options, animations } = context;

    if (!widgets || widgets.length === 0) {
        return '';
    }

    // 使用项目名（前端通过 options.fileName 传入）作为类名，默认 GeneratedUI
    const className = options.fileName || 'GeneratedUI';

    let lua = '';
    lua += '-- 由 Vue UI 设计器自动生成\n';
    lua += '-- 你可以根据需要改名 / 增加逻辑\n\n';
    lua += `---@class ${className}:Frame.Panel\n`;
    lua += `---@field new fun():${className}\n`;
    lua += `${className} = Class('${className}', Frame.Panel)\n\n`;
    lua += `function ${className}:ctor()\n`;
    lua += '    Frame.Panel.ctor(self, {\n';
    lua += '        parent = Frame.GameUI,\n';
    lua += '        x = 0,\n';
    lua += '        y = 0,\n';
    lua += '        w = 1920,\n';
    lua += '        h = 1080,\n';
    lua += '        image = Const.Texture.blank,\n';
    lua += '        -- 以下子控件由设计器生成\n';

    const emitWidget = (w: Widget, indent: number) => {
        const pad = ' '.repeat(indent);
        let luaType = 'Panel';
        if (w.type === 'label' || w.type === 'input') luaType = 'Text';
        if (w.type === 'button') luaType = 'Button';

        lua += `${pad}{\n`;
        lua += `${pad}    name = '${w.name}',\n`;
        lua += `${pad}    type = '${luaType}',\n`;
        lua += `${pad}    x = ${Math.round(w.x)},\n`;
        lua += `${pad}    y = ${Math.round(w.y)},\n`;
        lua += `${pad}    w = ${Math.round(w.w)},\n`;
        lua += `${pad}    h = ${Math.round(w.h)},\n`;

        // 文本字段：
        // - Panel 类型完全不导出 text
        // - 其它类型（Button / Text 等）只有在非空时才导出，避免 text = [[ ]]
        if (luaType !== 'Panel') {
            const text = w.text ?? '';
            if (String(text).length > 0) {
                lua += `${pad}    text = [[${text}]],\n`;
            }
        }

        if (w.image) {
            // 如果提供了路径转换选项，则转换路径
            let imagePath = w.image;
            if (options.resourcePath && options.codePath) {
                imagePath = convertImagePath(w.image, options.resourcePath, options.codePath);
            }
            lua += `${pad}    image = [[${imagePath}]],\n`;
        }

        if (w.type === 'checkbox') {
            lua += `${pad}    checked = ${w.checked ? 'true' : 'false'},\n`;
        }
        if (w.type === 'combobox') {
            lua += `${pad}    selected_index = ${w.selectedIndex || 0},\n`;
        }

        const children = widgets.filter((child) => child.parentId === w.id);
        if (children.length) {
            lua += `${pad}    -- children\n`;
            children.forEach((child) => {
                emitWidget(child, indent + 4);
            });
        }

        lua += `${pad}},\n`;
    };

    // 只导出根节点（parentId 为 null）
    widgets
        .filter((w) => w.parentId == null)
        .forEach((w) => emitWidget(w, 8));

    lua += '    })\n';
    lua += 'end\n\n';

    // 如果有动画数据，则追加一个 animations 表，游戏内可以自行解析使用
    const animMap = animations || {};
    const widgetIds = Object.keys(animMap);
    if (widgetIds.length > 0) {
        lua += '-- 动画数据（由编辑器导出，按控件 id 分组）\n';
        lua += `${className}.animations = {\n`;
        widgetIds.forEach((wid) => {
            const list = animMap[wid] || [];
            lua += `    [${wid}] = {\n`;
            list.forEach((a) => {
                lua += '        {\n';
                lua += `            name = [[${a.name || ''}]],\n`;
                lua += `            type = [[${a.type || ''}]],\n`;
                lua += `            duration = ${a.duration || 0},\n`;
                lua += `            delay = ${a.delay || 0},\n`;
                lua += `            loop = ${a.loop ? 'true' : 'false'},\n`;
                const p = a.params || {};
                const hasToX = p.toX !== undefined && p.toX !== null;
                const hasToY = p.toY !== undefined && p.toY !== null;
                const hasTween = p.tweenType !== undefined && p.tweenType !== null;
                if (hasToX || hasToY || hasTween) {
                    lua += '            params = {\n';
                    if (hasToX) {
                        lua += `                toX = ${p.toX},\n`;
                    }
                    if (hasToY) {
                        lua += `                toY = ${p.toY},\n`;
                    }
                    if (hasTween) {
                        // tweenType 对应 lapi.TWEEN_TYPE 枚举值
                        lua += `                tweenType = ${p.tweenType},\n`;
                    }
                    lua += '            },\n';
                }
                lua += '        },\n';
            });
            lua += '    },\n';
        });
        lua += '}\n\n';
    }

    // 返回生成的 Lua 代码字符串
    return lua;
}

// 插件元数据
export const metadata = {
    id: 'lua-export',
    name: 'Lua 导出插件',
    description: '将 UI 设计器中的控件导出为 Lua 代码（Frame UI 框架格式）',
    outputFormat: 'lua',
    version: '1.0.0',
    type: 'builtin' as const,
};

// 导出插件模块
const plugin: ExportPluginModule = {
    metadata,
    export: exportFunction,
};

export default plugin;

