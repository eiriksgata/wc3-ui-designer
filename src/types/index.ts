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

