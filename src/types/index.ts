// 通用类型定义
//
// schema 2.0.0：资源模型彻底重写。
//   - widget.image / clickImage / hoverImage 运行时（in-memory）存"绝对路径"，
//     例如 `D:/wc3-assets/icons/foo.blp`，便于 UI 画布直接预览。
//   - 落盘到 `.uiproj` 时由 useProjectFile 统一把绝对路径改写成相对全局资源库根的 relPath
//     （形如 `icons\foo.blp`，始终反斜杠风格——和 war3 imported 路径一致）。
//   - 载入时再把 relPath 展开成 `<globalResourceRoot>/<rel>` 绝对路径。
//   - 导出代码时由插件拼成 `war3mapImported\icons\foo.blp`；拷贝资源时源头是绝对路径，
//     目标保留相对目录层级。
//
// 不再有 `project.resources` 登记表——全局库就是唯一的资源源，控件直接引用。
export const PROJECT_SCHEMA_VERSION = '2.0.0';

/**
 * 文本水平对齐（对应模板 Text.ts 的 TextAlign: LEFT=0, CENTER=50, RIGHT=100）
 */
export type TextAlignH = 'left' | 'center' | 'right';

/**
 * 文本垂直对齐（对应模板 Text.ts 的 VerticalAlign: TOP=0, MIDDLE=50, BOTTOM=100）
 */
export type TextAlignV = 'top' | 'middle' | 'bottom';

export interface WidgetPadding {
    top: number;
    right: number;
    bottom: number;
    left: number;
}

export interface Widget {
    id: number;
    name: string;
    type: string;
    parentId: number | null;
    x: number;
    y: number;
    w: number;
    h: number;
    enable: boolean;
    visible: boolean;
    locked: boolean;

    // 文本样式（text、以及 button/panel 里的"内嵌文字"都可用）
    font?: string;
    fontSize?: number;
    outlineSize?: number;
    /** 水平对齐；对应模板 TextAlign */
    textAlignH?: TextAlignH;
    /** 垂直对齐；对应模板 VerticalAlign */
    textAlignV?: TextAlignV;
    /** 文本颜色（十六进制 RGB，不带 # 前缀，如 "FFFFFF"） */
    textColor?: string;

    text: string;

    // 图像
    image?: string;
    clickImage?: string;
    hoverImage?: string;

    // 交互
    draggable?: boolean;
    checked?: boolean;
    selectedIndex?: number;

    // 通用外观
    /** 0-255 透明度；映射到模板 setAlpha */
    alpha?: number;
    /** 内边距（像素），映射到模板 Text/Button.setTextPaddingTRBL */
    padding?: WidgetPadding;

    // 按钮角色
    tooltip?: string;
    /** FDF 模板预设名（来自 ButtonTemplates），走 Button.createWithTemplate */
    fdfTemplate?: string;
    /** 悬浮透明度（0-255），映射到 Button.addHoverEffect */
    hoverAlpha?: number;
    /** 普通态透明度（0-255），映射到 Button.addHoverEffect */
    normalAlpha?: number;

    // 面板角色
    showTitleBar?: boolean;
    titleBarHeight?: number;
    title?: string;
    titleColor?: string;
    showCloseButton?: boolean;

    // 背景预设（UIBackgrounds 里的键名，如 'BLACK_TRANSPARENT'），优先级高于 image
    backgroundPreset?: string;

    // wc3-map-ts-template codegen hints (optional, non-breaking for existing plugins)
    /**
     * Explicit mapping to a template component class.
     * Allowed values: 'Panel' | 'Button' | 'Dialog' | 'Text' | 'Tips' | 'MessageList' | 'FDFButton'
     * When omitted, the template exporter infers from `type`.
     */
    templateKind?: string;
    /**
     * Free-form metadata consumed by the template exporter.
     */
    meta?: Record<string, unknown>;
}

export interface Settings {
    canvasWidth: number;
    canvasHeight: number;
    rulerStep: number;
    gridSnapStep: number;
    autoSave: boolean;
    controlPanelWidth: number;
    canvasBgColor: string;
    canvasBgImage: string;
    /**
     * 全局资源库根目录（绝对路径）。用户级设置，仅存 localStorage，
     * **不会写入 .uiproj**。为空时"导入资源…"会弹首次引导对话框。
     */
    globalResourceRootPath?: string;
    /**
     * 导入时是否默认把非 BLP 转成 BLP。用户级设置，不写入 .uiproj。
     */
    defaultConvertToBlp?: boolean;
}

/**
 * 全局资源库的一条条目——仅作为运行时传值用，**不再落盘**到 .uiproj。
 *
 * - `label`：展示名（通常是文件名）。
 * - `value`：为兼容旧插件接口而保留的字段，内容 = `war3mapImported\<relPath>`。
 *   新代码里优先用 `localPath`。导出插件不再依赖它——useExport 会现场扫 widgets 派生。
 * - `localPath`：绝对磁盘路径，`<globalResourceRoot>/<relPath>`。画布预览与导出都用它。
 * - `relPath`：相对全局库根，反斜杠风格（`icons\foo.blp`）。保存 .uiproj 时写的就是它。
 * - `previewUrl`：预览用 data URL / file URL；可能为空。
 */
export interface ImageResource {
    label: string;
    value: string;
    localPath?: string;
    relPath?: string;
    previewUrl?: string;
}

export interface Animation {
    id: number;
    widgetId: number;
    name: string;
    type: string;
    duration?: number;
    delay?: number;
    loop?: boolean;
    params?: {
        toX?: number | null;
        toY?: number | null;
        tweenType?: number;
        [key: string]: any;
    };
    [key: string]: any;
}

/**
 * 读取 widget 对齐方式。缺省返回 (left, top)。
 */
export function getWidgetAlign(w: Widget): { h: TextAlignH; v: TextAlignV } {
    return {
        h: (w.textAlignH as TextAlignH) || 'left',
        v: (w.textAlignV as TextAlignV) || 'top',
    };
}
