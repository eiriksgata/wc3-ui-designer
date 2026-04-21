// 通用类型定义
// Project schema version used when persisting *.uiproj.
// Bump when the on-disk widget schema changes.
export const PROJECT_SCHEMA_VERSION = '1.1.0';

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
}

export interface ImageResource {
    label: string;
    value: string;
    localPath?: string;
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
