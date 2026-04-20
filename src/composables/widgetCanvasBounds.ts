import type { Widget } from '../types';

/** 将控件矩形限制在画布 [0,cw]×[0,ch] 内（左上原点，与导出一致） */
export function clampWidgetRect(
    x: number,
    y: number,
    w: number,
    h: number,
    cw: number,
    ch: number,
): { x: number; y: number; w: number; h: number } {
    const canvasW = Math.max(1, cw);
    const canvasH = Math.max(1, ch);
    let ww = Math.max(1, w);
    let hh = Math.max(1, h);
    ww = Math.min(ww, canvasW);
    hh = Math.min(hh, canvasH);
    const nx = Math.max(0, Math.min(x, canvasW - ww));
    const ny = Math.max(0, Math.min(y, canvasH - hh));
    return { x: nx, y: ny, w: ww, h: hh };
}

export function clampAllWidgetsInPlace(widgets: Widget[], cw: number, ch: number): void {
    widgets.forEach((w) => {
        const c = clampWidgetRect(w.x ?? 0, w.y ?? 0, w.w ?? 1, w.h ?? 1, cw, ch);
        w.x = c.x;
        w.y = c.y;
        w.w = c.w;
        w.h = c.h;
    });
}
