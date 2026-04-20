#!/usr/bin/env node
/**
 * wc3-map-ts-template codegen
 *
 * 用途：把 ui-designer 的结构化 JSON（或 .uiproj 项目中的等价数据）转换为
 * wc3-map-ts-template 仓中 `src/ui/generated/<Name>.ts` + `<Name>.ui.json` sidecar。
 *
 * 与 src/plugins/builtin/wc3-template-export.ts 保持同一套生成逻辑，
 * 因此在 UI 里“导出”和在 CI 里 `yarn ui:pull` 得到的产物应**逐字节一致**。
 *
 * 输入：
 *   1) 结构化 JSON 文件（由 `ui_export_structured_json` 导出），或
 *   2) `--mcp <URL>` 从在跑的 UI Designer 桌面端拉取（默认 http://127.0.0.1:8765）
 *
 * 输出：
 *   --out-dir <dir>          生成 .ts 与 .ui.json 的目录（默认 src/ui/generated）
 *   --class-name <Name>      生成的模块/类名（默认用 projectName）
 *   --resources-prefix <s>   期望的图片资源路径前缀，默认 "war3mapImported/"；
 *                            不匹配时在 --strict 下报错
 *   --strict                 资源路径不合规约直接失败退出
 *   --check                  只做 diff，不写盘；发现变化时 exit 1
 *
 * 用法示例：
 *   node codegen.mjs tmp/ui-structured.json --out-dir src/ui/generated
 *   node codegen.mjs --mcp http://127.0.0.1:8765 --class-name ShopUI --out-dir src/ui/generated
 *   node codegen.mjs tmp/ui-structured.json --out-dir src/ui/generated --check
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

// -------------------- CLI 解析 --------------------

function parseArgs(argv) {
    const args = {
        positional: [],
        outDir: 'src/ui/generated',
        className: null,
        resourcesPrefix: 'war3mapImported/',
        strict: false,
        check: false,
        mcp: null,
    };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        switch (a) {
            case '--out-dir':
                args.outDir = argv[++i];
                break;
            case '--class-name':
                args.className = argv[++i];
                break;
            case '--resources-prefix':
                args.resourcesPrefix = argv[++i];
                break;
            case '--strict':
                args.strict = true;
                break;
            case '--check':
                args.check = true;
                break;
            case '--mcp':
                args.mcp = argv[++i] || 'http://127.0.0.1:8765';
                break;
            case '-h':
            case '--help':
                args.help = true;
                break;
            default:
                if (a.startsWith('--')) {
                    throw new Error(`Unknown flag: ${a}`);
                }
                args.positional.push(a);
        }
    }
    return args;
}

// -------------------- 输入来源 --------------------

async function loadStructuredFromFile(filePath) {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
}

async function loadStructuredFromMcp(baseUrl) {
    const mod = await import('@modelcontextprotocol/sdk/client/index.js').catch(
        () => null,
    );
    const transportMod = await import(
        '@modelcontextprotocol/sdk/client/streamableHttp.js'
    ).catch(() => null);
    if (!mod || !transportMod) {
        throw new Error(
            'MCP 拉取模式需要安装 @modelcontextprotocol/sdk（参考 runtime-transaction-example.mjs）',
        );
    }
    const { Client } = mod;
    const { StreamableHTTPClientTransport } = transportMod;
    const base = new URL(baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
    const transport = new StreamableHTTPClientTransport(base);
    const client = new Client({ name: 'wc3-template-codegen', version: '1.0.0' });
    await client.connect(transport);
    const raw = await client.callTool({
        name: 'ui_export_structured_json',
        arguments: {},
    });
    await client.close();

    const text = (raw?.content || [])
        .map((c) => (c?.type === 'text' ? c.text : ''))
        .join('')
        .trim();
    const envelope = text ? JSON.parse(text) : raw;
    // envelope.data.content 是字符串（见 mcp_http.rs `ui_export_structured_json`）
    const contentStr = envelope?.data?.content;
    if (typeof contentStr !== 'string') {
        throw new Error('MCP envelope 中缺少 data.content（string）');
    }
    return JSON.parse(contentStr);
}

// -------------------- 代码生成 --------------------

const BEGIN_MARKER = '// <ui-designer:generated:BEGIN>';
const END_MARKER = '// <ui-designer:generated:END>';

const TEMPLATE_KINDS = new Set([
    'Panel',
    'Button',
    'Dialog',
    'Text',
    'Tips',
    'MessageList',
    'FDFButton',
]);

function safeIdentifier(raw, fallback) {
    const cleaned = (raw || '').replace(/[^A-Za-z0-9_]/g, '_');
    if (!cleaned) return fallback;
    return /^[A-Za-z_]/.test(cleaned) ? cleaned : `_${cleaned}`;
}

function pascalCase(raw, fallback) {
    const parts = (raw || '')
        .split(/[^A-Za-z0-9]+/)
        .filter((p) => p.length > 0);
    if (parts.length === 0) return fallback;
    return parts
        .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
        .join('');
}

function tsString(raw) {
    const s = String(raw ?? '');
    return `"${s
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n')}"`;
}

function inferKind(w) {
    const hint = (w.templateKind || '').trim();
    if (hint && TEMPLATE_KINDS.has(hint)) return hint;
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

function collectImports(kinds) {
    const componentKinds = ['Panel', 'Button', 'Dialog', 'Text', 'Tips', 'MessageList'].filter(
        (k) => kinds.has(k),
    );
    const lines = [];
    componentKinds.forEach((k) =>
        lines.push(`import { ${k} } from "src/system/ui/component/${k}";`),
    );
    if (kinds.has('FDFButton')) {
        lines.push(`import { FDFButtonBuilder } from "src/system/ui/fdf/FDFButton";`);
    }
    if (componentKinds.length > 0 || kinds.has('FDFButton')) {
        lines.push(
            `import { UIComponentManager } from "src/system/ui/component/UIComponentBase";`,
        );
    }
    return lines.join('\n');
}

function renderWidgetDeclaration(w, varName, kind) {
    const x = Math.round(w.x);
    const y = Math.round(w.y);
    const wide = Math.round(w.w);
    const high = Math.round(w.h);
    const text = w.text ?? '';
    const declare = [];
    const register = [];

    switch (kind) {
        case 'Panel':
            declare.push(
                `    const ${varName} = new Panel(${x}, ${y}, ${wide}, ${high});`,
            );
            declare.push(`    ${varName}.create();`);
            break;
        case 'Button':
            declare.push(
                `    const ${varName} = new Button(${tsString(text || w.name)}, ${x}, ${y}, ${wide}, ${high});`,
            );
            declare.push(`    ${varName}.create();`);
            break;
        case 'Text':
            declare.push(
                `    const ${varName} = new Text(${tsString(text)}, ${x}, ${y}, ${wide}, ${high});`,
            );
            declare.push(`    ${varName}.create();`);
            break;
        case 'Dialog':
            declare.push(
                `    const ${varName} = new Dialog(${tsString(text || w.name)}, ${wide}, ${high});`,
            );
            declare.push(`    ${varName}.create();`);
            break;
        case 'MessageList':
            declare.push(
                `    const ${varName} = new MessageList(${x}, ${y}, ${wide}, ${high});`,
            );
            break;
        case 'Tips':
            declare.push(
                `    // Tips: 请按 src/system/ui/component/Tips.ts 当前构造签名手动补齐；`,
            );
            declare.push(
                `    const ${varName} = new Panel(${x}, ${y}, ${wide}, ${high});`,
            );
            declare.push(`    ${varName}.create();`);
            break;
        case 'FDFButton':
            declare.push(
                `    const ${varName} = FDFButtonBuilder.createButton(${tsString(
                    w.name,
                )}, { x: ${x}, y: ${y}, width: ${wide}, height: ${high} }, {});`,
            );
            break;
    }

    if (w.image) {
        declare.push(
            `    // image 需要按目标组件 API 绑定，示例：(${varName} as any).setBackground?.(${tsString(
                w.image,
            )});`,
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
    register.push(
        `    UIComponentManager.getInstance().register(${varName} as any, ${tsString(
            w.name || varName,
        )});`,
    );
    return { declare, register };
}

/**
 * 输入： structured JSON（由 ui_export_structured_json 产生）
 * 返回： { ts, sidecar }
 */
function generate({ structured, className, projectName, resourcesPrefix, strict }) {
    const widgets = structured?.widgets?.flat || structured?.widgets || [];
    if (!Array.isArray(widgets) || widgets.length === 0) {
        throw new Error('structured JSON 缺少 widgets.flat 或 widgets 数组');
    }

    // 资源路径契约
    const resourceIssues = [];
    for (const w of widgets) {
        for (const field of ['image', 'clickImage', 'hoverImage']) {
            const v = w?.[field];
            if (typeof v === 'string' && v.length > 0) {
                const normalized = v.replace(/\\/g, '/');
                if (!normalized.startsWith(resourcesPrefix)) {
                    resourceIssues.push(
                        `widget "${w.name || w.id}" 的 ${field} 不是以 "${resourcesPrefix}" 开头: ${v}`,
                    );
                }
            }
        }
    }
    if (strict && resourceIssues.length > 0) {
        const msg = ['资源路径不符合约定：', ...resourceIssues].join('\n  ');
        throw new Error(msg);
    }

    const resolvedProjectName = (projectName || 'GeneratedUI').trim() || 'GeneratedUI';
    const moduleName = safeIdentifier(resolvedProjectName, 'GeneratedUI');
    const resolvedClassName = pascalCase(
        className || resolvedProjectName,
        'GeneratedUI',
    );

    const usedKinds = new Set();
    const usedNames = new Set();
    const perWidget = [];

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

    const lines = [];
    lines.push('/**');
    lines.push(' * Auto-generated by ui-designer (wc3-template-export, codegen.mjs).');
    lines.push(
        ' * DO NOT edit content between <ui-designer:generated:BEGIN> and END markers.',
    );
    lines.push(' * Put custom logic (event callbacks, game-state wiring) OUTSIDE the markers.');
    lines.push(' */');
    lines.push('');
    lines.push(collectImports(usedKinds));
    lines.push('');
    lines.push(`// Module: ${moduleName}`);
    lines.push(`// Class:  ${resolvedClassName}`);
    lines.push('');
    lines.push('const __uiComponents: Array<{ destroy?: () => void }> = [];');
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
    const hasParenting = perWidget.some((p) => p.widget.parentId != null);
    if (hasParenting) {
        lines.push('    // parent/child hints (bind manually according to component API):');
        for (const { widget, varName } of perWidget) {
            if (widget.parentId == null) continue;
            const parent = perWidget.find((p) => p.widget.id === widget.parentId);
            if (!parent) continue;
            lines.push(
                `    // (${parent.varName} as any).addChild?.(${varName}); // ${parent.widget.name} -> ${widget.name}`,
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

    const ts = lines.join('\n');

    const sidecar = {
        version: 1,
        generator: 'wc3-template-export',
        generatedAt: new Date().toISOString(),
        projectName: resolvedProjectName,
        className: resolvedClassName,
        settings: structured?.settings || null,
        widgets,
        animations: structured?.animations || {},
        resourcesPrefix,
        resourceWarnings: resourceIssues,
    };

    return { ts, sidecar, moduleName, resolvedClassName, resourceIssues };
}

// -------------------- 写盘 / --check 比对 --------------------

async function ensureDir(dirPath) {
    await fs.mkdir(dirPath, { recursive: true });
}

async function readIfExists(p) {
    try {
        return await fs.readFile(p, 'utf8');
    } catch (e) {
        if (e && e.code === 'ENOENT') return null;
        throw e;
    }
}

function hashOf(s) {
    return crypto.createHash('sha256').update(s).digest('hex').slice(0, 12);
}

/**
 * sidecar 写入前稳定化：把 generatedAt 剥离出来，用作漂移无关的 content hash，
 * 避免两次 pull 因时间戳不同就报告 diff。
 */
function sidecarForHash(sidecar) {
    const clone = { ...sidecar };
    delete clone.generatedAt;
    return JSON.stringify(clone, null, 2);
}

function sidecarToText(sidecar) {
    return JSON.stringify(sidecar, null, 2) + '\n';
}

// -------------------- 主流程 --------------------

function printHelp() {
    const lines = [
        'Usage: node codegen.mjs [<structured-json-path>] [options]',
        '',
        'Options:',
        '  --mcp <url>             Pull structured JSON from a running UI Designer (http://127.0.0.1:8765 by default)',
        '  --out-dir <dir>         Output directory (default: src/ui/generated)',
        '  --class-name <Name>     Override module/class name',
        '  --resources-prefix <p>  Required resource path prefix (default: war3mapImported/)',
        '  --strict                Fail on any resource path violation',
        '  --check                 Do not write; exit 1 if the planned output differs from disk',
        '  -h, --help              Show this help',
    ];
    console.log(lines.join('\n'));
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
        printHelp();
        return 0;
    }

    let structured;
    if (args.mcp) {
        structured = await loadStructuredFromMcp(args.mcp);
    } else {
        const inputPath = args.positional[0];
        if (!inputPath) {
            printHelp();
            throw new Error('缺少输入：需要结构化 JSON 文件路径，或使用 --mcp 从桌面端拉取');
        }
        structured = await loadStructuredFromFile(inputPath);
    }

    const projectName =
        structured?.meta?.projectName ||
        structured?.projectName ||
        args.className ||
        'GeneratedUI';

    const { ts, sidecar, moduleName, resourceIssues } = generate({
        structured,
        className: args.className,
        projectName,
        resourcesPrefix: args.resourcesPrefix,
        strict: args.strict,
    });

    const outDir = path.resolve(args.outDir);
    const tsPath = path.join(outDir, `${moduleName}.ts`);
    const sidecarPath = path.join(outDir, `${moduleName}.ui.json`);

    const existingTs = await readIfExists(tsPath);
    const existingSidecar = await readIfExists(sidecarPath);
    const sidecarText = sidecarToText(sidecar);

    const tsChanged = existingTs !== ts;
    const sidecarChanged = existingSidecar
        ? hashOf(sidecarForHash(sidecar)) !==
          hashOf(sidecarForHash(JSON.parse(existingSidecar)))
        : true;

    if (args.check) {
        const diffs = [];
        if (tsChanged) diffs.push(`TS drift: ${tsPath}`);
        if (sidecarChanged) diffs.push(`sidecar drift: ${sidecarPath}`);
        if (resourceIssues.length > 0) {
            diffs.push(`${resourceIssues.length} resource path warning(s)`);
            resourceIssues.forEach((m) => diffs.push(`  - ${m}`));
        }
        if (diffs.length === 0) {
            console.log(`[ui:check] OK — ${tsPath}`);
            return 0;
        }
        console.error(`[ui:check] drift detected:\n  - ${diffs.join('\n  - ')}`);
        return 1;
    }

    await ensureDir(outDir);
    await fs.writeFile(tsPath, ts, 'utf8');
    await fs.writeFile(sidecarPath, sidecarText, 'utf8');
    console.log(`[codegen] wrote ${tsPath}`);
    console.log(`[codegen] wrote ${sidecarPath}`);
    if (resourceIssues.length > 0) {
        console.warn(`[codegen] ${resourceIssues.length} resource warning(s):`);
        resourceIssues.forEach((m) => console.warn(`  - ${m}`));
    }
    return 0;
}

main()
    .then((code) => process.exit(code || 0))
    .catch((err) => {
        console.error(err?.stack || err?.message || err);
        process.exit(1);
    });
