/**
 * Warcraft III 原生 Frame 坐标（如 BlzFrameSetAbsPoint）在 4:3 游戏 UI 平面上：
 * X 方向约 0～0.8，Y 方向约 0～0.6，左下为原点。
 * 设计器使用「与 0.8×0.6 成比例」的像素画布（固定 4:3），便于与引擎归一化范围一一对应。
 *
 * @see 社区文档：The Big UI-Frame Tutorial / BlzFrameSetAbsPoint 坐标说明
 */
export const WC3_FRAME_UI_NORM_WIDTH = 0.8;
export const WC3_FRAME_UI_NORM_HEIGHT = 0.6;

/** 逻辑画布最小宽度（对应高度 600，与 800×600 常见参考一致） */
export const WC3_CANVAS_MIN_WIDTH = 800;
/** 由宽度推导高度，不单独限制高度最大值（最大宽度时高度为 2880） */
export const WC3_CANVAS_MAX_WIDTH = 3840;

function toFiniteNumber(n: unknown, fallback: number): number {
    if (n === null || n === undefined || n === '') return fallback;
    const x = typeof n === 'number' ? n : Number(n);
    if (!Number.isFinite(x)) return fallback;
    return x;
}

/** 与 0.8:0.6 一致：height = width × (0.6/0.8) */
export function canvasHeightFromWidth(width: number): number {
    return Math.round((width * WC3_FRAME_UI_NORM_HEIGHT) / WC3_FRAME_UI_NORM_WIDTH);
}

/** 由高度反推宽度（用于旧数据只有 height 时） */
export function canvasWidthFromHeight(height: number): number {
    return Math.round((height * WC3_FRAME_UI_NORM_WIDTH) / WC3_FRAME_UI_NORM_HEIGHT);
}

/**
 * 设计器像素 (px, py) 在画布内的归一化坐标（0～0.8，0～0.6），与 WC3 全屏 UI 范围同比例。
 * 注意：引擎里部分 API 为左下原点；若接 BlzFrameSetAbsPoint 需自行做 Y 翻转。
 */
export function canvasPixelToNormX(px: number, canvasW: number): number {
    if (canvasW <= 0) return 0;
    return (px / canvasW) * WC3_FRAME_UI_NORM_WIDTH;
}

export function canvasPixelToNormY(py: number, canvasH: number): number {
    if (canvasH <= 0) return 0;
    return (py / canvasH) * WC3_FRAME_UI_NORM_HEIGHT;
}

export function clampCanvasSize(width: unknown, height: unknown): { width: number; height: number } {
    let w = toFiniteNumber(width, NaN);
    const hIn = toFiniteNumber(height, NaN);
    if (!Number.isFinite(w) && Number.isFinite(hIn)) {
        w = canvasWidthFromHeight(hIn);
    }
    if (!Number.isFinite(w)) {
        w = WC3_CANVAS_MIN_WIDTH;
    }
    w = Math.min(WC3_CANVAS_MAX_WIDTH, Math.max(WC3_CANVAS_MIN_WIDTH, Math.round(w)));
    return { width: w, height: canvasHeightFromWidth(w) };
}
