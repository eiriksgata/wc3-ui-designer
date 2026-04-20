// 通用类型定义

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
    font?: string;
    fontSize?: number;
    outlineSize?: number;
    textAlign?: string;
    text: string;
    image?: string;
    clickImage?: string;
    hoverImage?: string;
    draggable?: boolean;
    checked?: boolean;
    selectedIndex?: number;

    // wc3-map-ts-template codegen hints (optional, non-breaking for existing plugins)
    /**
     * Explicit mapping to a template component class.
     * Allowed values: 'Panel' | 'Button' | 'Dialog' | 'Text' | 'Tips' | 'MessageList' | 'FDFButton'
     * When omitted, the template exporter infers from `type`.
     */
    templateKind?: string;
    /**
     * Free-form metadata consumed by the template exporter (zIndex, anchor,
     * drag callbacks, color overrides, FDF template name, ...). Kept out of
     * the top-level to avoid breaking older plugins that enumerate Widget fields.
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

