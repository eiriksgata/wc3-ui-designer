/** 与 App.vue 中 .ruler-vertical / .ruler-horizontal 占位一致（逻辑坐标系，已除以 uiZoom）。 */
export const CANVAS_RULER_LEFT = 26;
export const CANVAS_RULER_TOP = 20;
/** 适配时留白；钳位时至少保留在视口内的画布条带宽度。 */
export const CANVAS_VIEW_PADDING = 16;
export const CANVAS_EDGE_KEEP_PX = 12;
export const CANVAS_SCALE_MIN = 0.02;
export const CANVAS_SCALE_MAX = 3;

/**
 * 将平移限制在「缩放后的逻辑画布」与视口始终保留一定重叠的范围内，避免无限拖出空白。
 */
export function clampPanToBounds(
    panX: number,
    panY: number,
    scale: number,
    logicalW: number,
    logicalH: number,
    layoutViewportW: number,
    layoutViewportH: number,
    keepPx: number,
): { panX: number; panY: number } {
    const s = Math.max(scale, CANVAS_SCALE_MIN);
    const lw = Math.max(1, logicalW);
    const lh = Math.max(1, logicalH);
    const sw = lw * s;
    const sh = lh * s;
    const vw = Math.max(1, layoutViewportW);
    const vh = Math.max(1, layoutViewportH);
    const k = keepPx;

    let minX = k - sw;
    let maxX = vw - k;
    let minY = k - sh;
    let maxY = vh - k;

    if (minX > maxX) {
        const m = (minX + maxX) / 2;
        minX = maxX = m;
    }
    if (minY > maxY) {
        const m = (minY + maxY) / 2;
        minY = maxY = m;
    }

    return {
        panX: Math.min(maxX, Math.max(minX, panX)),
        panY: Math.min(maxY, Math.max(minY, panY)),
    };
}

/**
 * 计算缩放与平移，使整张逻辑画布落在标尺内侧可用区域内（尽量居中）。
 */
export function computeFitCanvasView(
    logicalW: number,
    logicalH: number,
    layoutViewportW: number,
    layoutViewportH: number,
): { scale: number; panX: number; panY: number } {
    const lw = Math.max(1, logicalW);
    const lh = Math.max(1, logicalH);
    const vw = Math.max(1, layoutViewportW);
    const vh = Math.max(1, layoutViewportH);

    const pad = CANVAS_VIEW_PADDING;
    const uw = Math.max(1, vw - CANVAS_RULER_LEFT - pad * 2);
    const uh = Math.max(1, vh - CANVAS_RULER_TOP - pad * 2);

    const sx = uw / lw;
    const sy = uh / lh;
    let scale = Math.min(sx, sy, CANVAS_SCALE_MAX);
    scale = Math.max(scale, CANVAS_SCALE_MIN);

    const cx = CANVAS_RULER_LEFT + pad + uw / 2;
    const cy = CANVAS_RULER_TOP + pad + uh / 2;
    const panX = cx - (lw * scale) / 2;
    const panY = cy - (lh * scale) / 2;

    return {
        scale,
        ...clampPanToBounds(panX, panY, scale, lw, lh, vw, vh, CANVAS_EDGE_KEEP_PX),
    };
}
