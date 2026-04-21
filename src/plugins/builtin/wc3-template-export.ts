import type { ExportPluginModule, ExportContext } from '../../types/plugin';
import type { Widget } from '../../types';
import { getWidgetAlign } from '../../types';

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
 *   5. 组合控件：
 *      - Button 的第一个 Text 子节点被合并到 `btn.setText*` 里；
 *      - Dialog 的 Button 子节点走 `dialog.addButton(...)`，它们自身不单独导出；
 *      - 其他控件通过 `parent.getContentFrame()` 建立父子帧链路。
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

function collectImports(kinds: Set<TemplateKind>, needPresets: boolean): string {
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
    if (kinds.has('Text') || kinds.has('Button')) {
        lines.push(
            `import { TextAlign, VerticalAlign } from "src/system/ui/component/Text";`,
        );
    }
    if (needPresets) {
        lines.push(
            `import { UIBackgrounds, ButtonTemplates } from "src/constants/ui/preset";`,
        );
    }
    // UIComponentManager 参与热重载清理
    if (componentKinds.length > 0 || kinds.has('FDFButton')) {
        lines.push(
            `import { UIComponentManager } from "src/system/ui/component/UIComponentBase";`,
        );
    }
    return lines.join('\n');
}

function textAlignConstant(h: string): string {
    if (h === 'center') return 'TextAlign.CENTER';
    if (h === 'right') return 'TextAlign.RIGHT';
    return 'TextAlign.LEFT';
}

function verticalAlignConstant(v: string): string {
    if (v === 'middle') return 'VerticalAlign.MIDDLE';
    if (v === 'bottom') return 'VerticalAlign.BOTTOM';
    return 'VerticalAlign.TOP';
}

/**
 * 把 Button / Panel / Text 的公共 setter 追加到声明尾部。
 * 作用于任何支持 setAlpha / hide / setEnabled / setDraggable 的模板组件。
 */
function appendCommonSetters(lines: string[], w: Widget, varName: string): void {
    if (typeof w.alpha === 'number' && w.alpha >= 0 && w.alpha <= 255 && w.alpha !== 255) {
        lines.push(`    (${varName} as any).setAlpha?.(${w.alpha});`);
    }
    if (w.visible === false) {
        lines.push(`    (${varName} as any).hide?.();`);
    }
    if (w.enable === false) {
        lines.push(`    (${varName} as any).setEnabled?.(false);`);
    }
}

function renderButtonBody(
    lines: string[],
    w: Widget,
    varName: string,
    mergedLabel: Widget | null,
    usedPresets: { bg: boolean; tpl: boolean },
): void {
    const label = mergedLabel || w;
    const labelText = (mergedLabel ? mergedLabel.text : w.text) || w.text || '';
    const { h, v } = getWidgetAlign(label);

    // FDF 模板预设：走 Button.createWithTemplate；否则走普通 create()
    if (w.fdfTemplate) {
        usedPresets.tpl = true;
        lines.push(
            `    ${varName}.createWithTemplate?.(ButtonTemplates.${w.fdfTemplate});`,
        );
    } else {
        lines.push(`    ${varName}.create();`);
    }

    if (w.backgroundPreset) {
        usedPresets.bg = true;
        lines.push(
            `    ${varName}.setTexture?.(UIBackgrounds.${w.backgroundPreset});`,
        );
    } else if (w.image) {
        lines.push(`    ${varName}.setTexture?.(${tsString(w.image)});`);
    }

    if (labelText) {
        lines.push(`    ${varName}.setText?.(${tsString(labelText)});`);
    }
    lines.push(
        `    ${varName}.setTextAlignment?.(${textAlignConstant(h)}, ${verticalAlignConstant(v)});`,
    );
    if (label.textColor && /^[0-9A-Fa-f]{6}$/.test(label.textColor)) {
        lines.push(
            `    ${varName}.setTextColor?.(${tsString(label.textColor.toUpperCase())});`,
        );
    }
    if (typeof label.fontSize === 'number' && label.fontSize > 0) {
        lines.push(`    ${varName}.setFontSizePixels?.(${Math.round(label.fontSize)});`);
    }
    if (label.font) {
        lines.push(`    ${varName}.setFont?.(${tsString(label.font)});`);
    }
    if (label.padding) {
        const p = label.padding;
        lines.push(
            `    ${varName}.setTextPaddingTRBL?.(${p.top || 0}, ${p.right || 0}, ${p.bottom || 0}, ${p.left || 0});`,
        );
    }
    if (w.tooltip) {
        lines.push(`    ${varName}.setTooltip?.(${tsString(w.tooltip)});`);
    }
    if (w.draggable === true) {
        lines.push(`    ${varName}.setDraggable?.(true);`);
    }
    if (typeof w.hoverAlpha === 'number') {
        const normal = typeof w.normalAlpha === 'number' ? w.normalAlpha : 255;
        lines.push(`    ${varName}.addHoverEffect?.(${w.hoverAlpha}, ${normal});`);
    }
}

function renderPanelBody(
    lines: string[],
    w: Widget,
    varName: string,
    usedPresets: { bg: boolean; tpl: boolean },
): void {
    if (w.showTitleBar) {
        lines.push(`    ${varName}.setShowTitleBar?.(true);`);
        if (w.title) {
            lines.push(`    ${varName}.setTitle?.(${tsString(w.title)});`);
        }
        if (w.titleColor && /^[0-9A-Fa-f]{6}$/.test(w.titleColor)) {
            lines.push(
                `    ${varName}.setTitleColor?.(${tsString(w.titleColor.toUpperCase())});`,
            );
        }
        if (typeof w.titleBarHeight === 'number' && w.titleBarHeight > 0) {
            lines.push(`    ${varName}.setTitleBarHeight?.(${Math.round(w.titleBarHeight)});`);
        }
    }
    if (w.showCloseButton) {
        lines.push(`    ${varName}.setShowCloseButton?.(true);`);
    }
    if (w.draggable === true) {
        lines.push(`    ${varName}.setDraggable?.(true);`);
    }
    if (w.backgroundPreset) {
        usedPresets.bg = true;
        lines.push(
            `    ${varName}.setBackgroundPreset?.(UIBackgrounds.${w.backgroundPreset});`,
        );
    } else if (w.image) {
        lines.push(`    ${varName}.setBackground?.(${tsString(w.image)});`);
    }
}

function renderTextBody(
    lines: string[],
    w: Widget,
    varName: string,
    usedPresets: { bg: boolean; tpl: boolean },
): void {
    const { h, v } = getWidgetAlign(w);
    lines.push(
        `    ${varName}.setAlignment?.(${textAlignConstant(h)}, ${verticalAlignConstant(v)});`,
    );
    if (w.textColor && /^[0-9A-Fa-f]{6}$/.test(w.textColor)) {
        lines.push(`    ${varName}.setColor?.(${tsString(w.textColor.toUpperCase())});`);
    }
    if (typeof w.fontSize === 'number' && w.fontSize > 0) {
        lines.push(`    ${varName}.setFontSizePixels?.(${Math.round(w.fontSize)});`);
    }
    if (w.font) {
        lines.push(`    ${varName}.setFont?.(${tsString(w.font)});`);
    }
    if (w.padding) {
        const p = w.padding;
        lines.push(
            `    ${varName}.setPaddingTRBL?.(${p.top || 0}, ${p.right || 0}, ${p.bottom || 0}, ${p.left || 0});`,
        );
    }
    if (w.backgroundPreset) {
        usedPresets.bg = true;
        lines.push(`    ${varName}.setShowBackground?.(true);`);
        lines.push(
            `    ${varName}.setBackgroundPreset?.(UIBackgrounds.${w.backgroundPreset});`,
        );
    } else if (w.image) {
        lines.push(`    ${varName}.setShowBackground?.(true);`);
        lines.push(`    ${varName}.setBackground?.(${tsString(w.image)});`);
    }
}

function exportFunction(context: ExportContext): string {
    const { widgets, options } = context;
    if (!widgets || widgets.length === 0) {
        return '';
    }

    const moduleName = safeIdentifier(
        (options.fileName as string) || 'GeneratedUI',
        'GeneratedUI',
    );
    const className = pascalCase(
        (options.className as string) ||
            (options.fileName as string) ||
            'GeneratedUI',
        'GeneratedUI',
    );

    // -- 1. 预计算合并集 --
    // Button 的首个 Text 子 → 合并，跳过独立渲染。
    const mergedIds = new Set<number>();
    const buttonLabelMap = new Map<number, Widget>(); // buttonId → labelWidget
    // Dialog 的 Button 子 → 走 addButton，跳过独立渲染。
    const dialogButtonsMap = new Map<number, Widget[]>(); // dialogId → childButtons

    for (const w of widgets) {
        if (inferKind(w) !== 'Button') continue;
        const firstLabel = widgets.find(
            (c) => c.parentId === w.id && inferKind(c) === 'Text',
        );
        if (firstLabel) {
            mergedIds.add(firstLabel.id);
            buttonLabelMap.set(w.id, firstLabel);
        }
    }

    for (const w of widgets) {
        if (inferKind(w) !== 'Dialog') continue;
        const children: Widget[] = [];
        for (const c of widgets) {
            if (c.parentId !== w.id) continue;
            if (inferKind(c) === 'Button') {
                mergedIds.add(c.id);
                // 递归并入 button 自己合并掉的 Text 子
                const childLabel = buttonLabelMap.get(c.id);
                if (childLabel) mergedIds.add(childLabel.id);
                children.push(c);
            } else if (
                inferKind(c) === 'Text' &&
                (c.name || '').toLowerCase().includes('title')
            ) {
                // Dialog 自己会渲染标题，跳过显式标题 Text 子节点
                mergedIds.add(c.id);
            }
        }
        dialogButtonsMap.set(w.id, children);
    }

    const usedKinds = new Set<TemplateKind>();
    const usedNames = new Set<string>();
    const usedPresets = { bg: false, tpl: false };
    const perWidget: Array<{
        widget: Widget;
        varName: string;
        kind: TemplateKind;
    }> = [];

    for (const w of widgets) {
        if (mergedIds.has(w.id)) continue;
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

    // 帮助查找父节点变量名
    const widgetIdToVar = new Map<number, string>();
    for (const p of perWidget) widgetIdToVar.set(p.widget.id, p.varName);
    const parentFrameExpr = (w: Widget): string => {
        if (w.parentId == null) return '';
        const parentVar = widgetIdToVar.get(w.parentId);
        if (!parentVar) return '';
        // 模板侧 Panel / Button / Text 都提供 getContentFrame()（见 Panel.ts / Button.ts）
        return `${parentVar}.getContentFrame?.() ?? ${parentVar}.getBackdropFrame?.()`;
    };

    // -- 2. 生成代码 --
    const body: string[] = [];

    for (const { widget, varName, kind } of perWidget) {
        const parentExpr = parentFrameExpr(widget);
        const x = Math.round(widget.x);
        const y = Math.round(widget.y);
        const wide = Math.round(widget.w);
        const high = Math.round(widget.h);
        const text = widget.text ?? '';

        body.push(`    // [${kind}] ${widget.name} (id=${widget.id})`);

        switch (kind) {
            case 'Panel': {
                body.push(
                    `    const ${varName} = new Panel(${x}, ${y}, ${wide}, ${high});`,
                );
                if (parentExpr) {
                    body.push(`    ${varName}.create(${parentExpr});`);
                } else {
                    body.push(`    ${varName}.create();`);
                }
                renderPanelBody(body, widget, varName, usedPresets);
                break;
            }
            case 'Button': {
                const label = buttonLabelMap.get(widget.id) || null;
                const labelText = label?.text ?? text ?? widget.name;
                body.push(
                    `    const ${varName} = new Button(${tsString(labelText)}, ${x}, ${y}, ${wide}, ${high});`,
                );
                // renderButtonBody 内部会选择 create() 或 createWithTemplate(...)。
                // 父帧通过 getButtonFrame().setParent 挂接（模板 Button 无 create(parent) 重载）。
                renderButtonBody(body, widget, varName, label, usedPresets);
                if (parentExpr) {
                    body.push(
                        `    (${varName} as any).getButtonFrame?.()?.setParent?.(${parentExpr});`,
                    );
                }
                break;
            }
            case 'Text': {
                const finalText = text || widget.name || '';
                body.push(
                    `    const ${varName} = new Text(${tsString(finalText)}, ${x}, ${y}, ${wide}, ${high});`,
                );
                if (parentExpr) {
                    body.push(`    ${varName}.create(${parentExpr});`);
                } else {
                    body.push(`    ${varName}.create();`);
                }
                renderTextBody(body, widget, varName, usedPresets);
                break;
            }
            case 'Dialog': {
                const title = widget.title || text || widget.name || '';
                body.push(
                    `    const ${varName} = new Dialog(${tsString(title)}, ${wide}, ${high});`,
                );
                body.push(`    ${varName}.create();`);
                if (typeof widget.x === 'number' && typeof widget.y === 'number') {
                    body.push(`    (${varName} as any).setPosition?.(${x}, ${y});`);
                }
                if (widget.titleColor && /^[0-9A-Fa-f]{6}$/.test(widget.titleColor)) {
                    body.push(
                        `    (${varName} as any).setTitleColor?.(${tsString(widget.titleColor.toUpperCase())});`,
                    );
                }
                const btns = dialogButtonsMap.get(widget.id) || [];
                for (const btn of btns) {
                    const lbl = buttonLabelMap.get(btn.id);
                    const btnText = (lbl?.text ?? btn.text) || btn.name;
                    body.push(
                        `    ${varName}.addButton?.({ text: ${tsString(btnText)}, onClick: () => { /* TODO: wire ${btn.name} */ } });`,
                    );
                }
                break;
            }
            case 'MessageList': {
                body.push(
                    `    const ${varName} = new MessageList(${x}, ${y}, ${wide}, ${high});`,
                );
                if (parentExpr) {
                    body.push(
                        `    (${varName} as any).create?.(${parentExpr});`,
                    );
                }
                break;
            }
            case 'Tips': {
                body.push(
                    `    // Tips: 请按 src/system/ui/component/Tips.ts 当前构造签名手动补齐；`,
                );
                body.push(
                    `    const ${varName} = new Panel(${x}, ${y}, ${wide}, ${high});`,
                );
                body.push(`    ${varName}.create();`);
                break;
            }
            case 'FDFButton': {
                body.push(
                    `    const ${varName} = FDFButtonBuilder.createButton(${tsString(
                        widget.name,
                    )}, { x: ${x}, y: ${y}, width: ${wide}, height: ${high} }, {});`,
                );
                break;
            }
        }

        appendCommonSetters(body, widget, varName);
        body.push(
            `    UIComponentManager.getInstance().register(${varName} as any, ${tsString(
                widget.name || varName,
            )});`,
        );
        body.push(`    __uiComponents.push(${varName} as any);`);
        body.push('');
    }

    // -- 3. 组装文件 --
    const lines: string[] = [];
    lines.push('/**');
    lines.push(' * Auto-generated by ui-designer (wc3-template-export).');
    lines.push(
        ' * DO NOT edit content between <ui-designer:generated:BEGIN> and END markers.',
    );
    lines.push(' * Put custom logic (event callbacks, game-state wiring) OUTSIDE the markers.');
    lines.push(' */');
    lines.push('');
    lines.push(collectImports(usedKinds, usedPresets.bg || usedPresets.tpl));
    lines.push('');
    lines.push(`// Module: ${moduleName}`);
    lines.push(`// Class:  ${className}`);
    lines.push('');
    lines.push('const __uiComponents: Array<{ destroy?: () => void }> = [];');
    lines.push('');
    lines.push('export function initialize(): void {');
    lines.push(`    ${BEGIN_MARKER}`);
    body.forEach((l) => lines.push(l));
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
    version: '1.1.0',
    type: 'builtin' as const,
};

const plugin: ExportPluginModule = {
    metadata,
    export: exportFunction,
};

export default plugin;
