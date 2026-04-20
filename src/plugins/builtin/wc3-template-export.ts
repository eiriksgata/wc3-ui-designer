import type { ExportPluginModule, ExportContext } from '../../types/plugin';
import type { Widget } from '../../types';

/**
 * wc3-map-ts-template 原生 TS 导出插件
 *
 * 目的：把 UI 设计器中的控件直接渲染成 wc3-map-ts-template（`src/system/ui/component/*`）
 * 中真实 API 的 TypeScript 代码，落地到模板仓后可直接经 `tstl` 编译进 map。
 *
 * 关键约定（与模板仓的 [src/system/HotReload.ts] 生命周期兼容）：
 *   1. 生成模块暴露 `initialize()` / `cleanup()` 两个顶层函数
 *   2. 自动段（new Panel / new Button / ... 的声明）包裹在
 *      `// <ui-designer:generated:BEGIN>` ... `// <ui-designer:generated:END>`
 *      之间，`codegen.mjs` 在 --check 与多次 regen 时只比对/只重写这段
 *   3. 用户业务逻辑（事件回调、条件显示等）写在 BEGIN/END 之外，永远不被覆盖
 *   4. 坐标按模板 `ScreenCoordinates.ORIGIN_TOP_LEFT` 语义以像素传入（不在这里折算为
 *      WC3 归一化坐标——模板侧 ScreenCoordinates 会做转换）
 */

type TemplateKind =
    | 'Panel'
    | 'Button'
    | 'Dialog'
    | 'Text'
    | 'Tips'
    | 'MessageList'
    | 'FDFButton';

const TEMPLATE_KINDS: ReadonlySet<TemplateKind> = new Set<TemplateKind>([
    'Panel',
    'Button',
    'Dialog',
    'Text',
    'Tips',
    'MessageList',
    'FDFButton',
]);

const BEGIN_MARKER = '// <ui-designer:generated:BEGIN>';
const END_MARKER = '// <ui-designer:generated:END>';

function safeIdentifier(raw: string, fallback: string): string {
    const cleaned = (raw || '').replace(/[^A-Za-z0-9_]/g, '_');
    if (!cleaned) return fallback;
    return /^[A-Za-z_]/.test(cleaned) ? cleaned : `_${cleaned}`;
}

function pascalCase(raw: string, fallback: string): string {
    const parts = (raw || '')
        .split(/[^A-Za-z0-9]+/)
        .filter((p) => p.length > 0);
    if (parts.length === 0) return fallback;
    return parts
        .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
        .join('');
}

function tsString(raw: string | undefined | null): string {
    const s = String(raw ?? '');
    return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
}

function inferKind(w: Widget): TemplateKind {
    const hint = (w.templateKind || '').trim();
    if (hint && TEMPLATE_KINDS.has(hint as TemplateKind)) {
        return hint as TemplateKind;
    }
    const t = (w.type || '').toLowerCase();
    switch (t) {
        case 'button':
            return 'Button';
        case 'fdfbutton':
        case 'fdf-button':
            return 'FDFButton';
        case 'dialog':
            return 'Dialog';
        case 'tips':
        case 'tooltip':
            return 'Tips';
        case 'messagelist':
        case 'message-list':
            return 'MessageList';
        case 'label':
        case 'text':
        case 'input':
            return 'Text';
        case 'frame':
        case 'panel':
        default:
            return 'Panel';
    }
}

function collectImports(kinds: Set<TemplateKind>): string {
    const componentKinds: TemplateKind[] = [
        'Panel',
        'Button',
        'Dialog',
        'Text',
        'Tips',
        'MessageList',
    ].filter((k) => kinds.has(k as TemplateKind)) as TemplateKind[];
    const lines: string[] = [];

    componentKinds.forEach((k) => {
        lines.push(`import { ${k} } from "src/system/ui/component/${k}";`);
    });
    if (kinds.has('FDFButton')) {
        lines.push(`import { FDFButtonBuilder } from "src/system/ui/fdf/FDFButton";`);
    }
    // UIComponentManager 参与热重载清理
    if (componentKinds.length > 0 || kinds.has('FDFButton')) {
        lines.push(
            `import { UIComponentManager } from "src/system/ui/component/UIComponentBase";`
        );
    }
    return lines.join('\n');
}

/**
 * 渲染单个控件的声明代码。
 * 返回 { declare, register } 两段：declare 是 `const x = new Kind(...);`，
 * register 是把它挂到 UIComponentManager（若适用）。
 */
function renderWidgetDeclaration(
    w: Widget,
    varName: string,
    kind: TemplateKind
): { declare: string[]; register: string[] } {
    const x = Math.round(w.x);
    const y = Math.round(w.y);
    const wide = Math.round(w.w);
    const high = Math.round(w.h);
    const text = w.text ?? '';
    const declare: string[] = [];
    const register: string[] = [];

    switch (kind) {
        case 'Panel': {
            declare.push(
                `    const ${varName} = new Panel(${x}, ${y}, ${wide}, ${high});`
            );
            declare.push(`    ${varName}.create();`);
            break;
        }
        case 'Button': {
            declare.push(
                `    const ${varName} = new Button(${tsString(text || w.name)}, ${x}, ${y}, ${wide}, ${high});`
            );
            declare.push(`    ${varName}.create();`);
            break;
        }
        case 'Text': {
            declare.push(
                `    const ${varName} = new Text(${tsString(text)}, ${x}, ${y}, ${wide}, ${high});`
            );
            declare.push(`    ${varName}.create();`);
            break;
        }
        case 'Dialog': {
            declare.push(
                `    const ${varName} = new Dialog(${tsString(text || w.name)}, ${wide}, ${high});`
            );
            declare.push(`    ${varName}.create();`);
            break;
        }
        case 'MessageList': {
            declare.push(
                `    const ${varName} = new MessageList(${x}, ${y}, ${wide}, ${high});`
            );
            break;
        }
        case 'Tips': {
            // Tips 模板侧构造签名差异较大，这里给出安全的占位：用 Panel + 标签代替
            // 真实需要时由用户在 BEGIN/END 外覆写
            declare.push(
                `    // Tips: 请按 src/system/ui/component/Tips.ts 当前构造签名手动补齐；`
            );
            declare.push(
                `    const ${varName} = new Panel(${x}, ${y}, ${wide}, ${high});`
            );
            declare.push(`    ${varName}.create();`);
            break;
        }
        case 'FDFButton': {
            declare.push(
                `    const ${varName} = FDFButtonBuilder.createButton(${tsString(
                    w.name
                )}, { x: ${x}, y: ${y}, width: ${wide}, height: ${high} }, {});`
            );
            break;
        }
    }

    if (w.image) {
        // Panel/Button/Text 都暴露 setBackground/setTexture 类接口，这里用安全的 any-cast 注释提醒
        declare.push(
            `    // image 需要按目标组件 API 绑定，示例：(${varName} as any).setBackground?.(${tsString(
                w.image
            )});`
        );
    }
    if (w.visible === false) {
        declare.push(`    (${varName} as any).hide?.();`);
    }
    if (w.enable === false) {
        declare.push(`    (${varName} as any).setEnabled?.(false);`);
    }
    if (w.draggable === true) {
        declare.push(`    (${varName} as any).setDraggable?.(true);`);
    }

    // 热重载注册（尽力而为：只对实现了 destroy() 的组件有用）
    register.push(
        `    UIComponentManager.getInstance().register(${varName} as any, ${tsString(
            w.name || varName
        )});`
    );

    return { declare, register };
}

function exportFunction(context: ExportContext): string {
    const { widgets, options } = context;
    if (!widgets || widgets.length === 0) {
        return '';
    }

    const moduleName = safeIdentifier(
        (options.fileName as string) || 'GeneratedUI',
        'GeneratedUI'
    );
    const className = pascalCase(
        (options.className as string) ||
            (options.fileName as string) ||
            'GeneratedUI',
        'GeneratedUI'
    );

    const usedKinds = new Set<TemplateKind>();
    const usedNames = new Set<string>();
    const perWidget: Array<{
        widget: Widget;
        varName: string;
        kind: TemplateKind;
    }> = [];

    for (const w of widgets) {
        const kind = inferKind(w);
        usedKinds.add(kind);

        let base = safeIdentifier(w.name, `w${w.id}`);
        if (base[0] && base[0] === base[0].toUpperCase()) {
            base = base.charAt(0).toLowerCase() + base.slice(1);
        }
        let name = base;
        let seq = 1;
        while (usedNames.has(name)) {
            name = `${base}_${seq++}`;
        }
        usedNames.add(name);
        perWidget.push({ widget: w, varName: name, kind });
    }

    const lines: string[] = [];
    lines.push('/**');
    lines.push(' * Auto-generated by ui-designer (wc3-template-export).');
    lines.push(
        ' * DO NOT edit content between <ui-designer:generated:BEGIN> and END markers.'
    );
    lines.push(' * Put custom logic (event callbacks, game-state wiring) OUTSIDE the markers.');
    lines.push(' */');
    lines.push('');
    lines.push(collectImports(usedKinds));
    lines.push('');
    lines.push(`// Module: ${moduleName}`);
    lines.push(`// Class:  ${className}`);
    lines.push('');
    lines.push(
        'const __uiComponents: Array<{ destroy?: () => void }> = [];'
    );
    lines.push('');
    lines.push('export function initialize(): void {');
    lines.push(`    ${BEGIN_MARKER}`);

    for (const { widget, varName, kind } of perWidget) {
        const { declare, register } = renderWidgetDeclaration(widget, varName, kind);
        lines.push(`    // [${kind}] ${widget.name} (id=${widget.id})`);
        declare.forEach((l) => lines.push(l));
        register.forEach((l) => lines.push(l));
        lines.push(`    __uiComponents.push(${varName} as any);`);
        lines.push('');
    }

    // 父子关系（仅记录，模板组件的 setParent 接口各异，保留为注释线索）
    const hasParenting = perWidget.some((p) => p.widget.parentId != null);
    if (hasParenting) {
        lines.push('    // parent/child hints (bind manually according to component API):');
        for (const { widget, varName } of perWidget) {
            if (widget.parentId == null) continue;
            const parent = perWidget.find((p) => p.widget.id === widget.parentId);
            if (!parent) continue;
            lines.push(
                `    // (${parent.varName} as any).addChild?.(${varName}); // ${parent.widget.name} -> ${widget.name}`
            );
        }
        lines.push('');
    }

    lines.push(`    ${END_MARKER}`);
    lines.push('}');
    lines.push('');
    lines.push('export function cleanup(): void {');
    lines.push(`    ${BEGIN_MARKER}`);
    lines.push('    while (__uiComponents.length > 0) {');
    lines.push('        const c = __uiComponents.pop();');
    lines.push('        try { c?.destroy?.(); } catch (_) { /* swallow */ }');
    lines.push('    }');
    lines.push('    UIComponentManager.getInstance().destroyAll?.();');
    lines.push(`    ${END_MARKER}`);
    lines.push('}');
    lines.push('');
    lines.push('// Put your custom wiring below this line (not managed by ui-designer):');
    lines.push('');

    return lines.join('\n');
}

export const metadata = {
    id: 'wc3-template-export',
    name: 'wc3-map-ts-template 导出插件',
    description:
        '生成与 wc3-map-ts-template 的 src/system/ui 组件库对齐的 TypeScript 代码（Panel/Button/Dialog/Text/Tips/MessageList/FDFButton）',
    outputFormat: 'typescript',
    version: '1.0.0',
    type: 'builtin' as const,
};

const plugin: ExportPluginModule = {
    metadata,
    export: exportFunction,
};

export default plugin;
