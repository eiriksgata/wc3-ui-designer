import { ref, type Ref } from 'vue';
import type { Widget } from '../types';

export function useCanvasInteraction(
    canvasRef: Ref<HTMLElement | null>,
    canvasScale: Ref<number>,
    panX: Ref<number>,
    panY: Ref<number>,
    isSpacePressed: Ref<boolean>,
    isPanning: Ref<boolean>,
    panStart: Ref<{ x: number; y: number; panX: number; panY: number }>,
    widgetsList: Ref<Widget[]>,
    selectedIds: Ref<number[]>,
    draggingId: Ref<number | null>,
    dragOffset: Ref<{ x: number; y: number }>,
    resizingId: Ref<number | null>,
    resizeStart: Ref<{ mouseX: number; mouseY: number; w: number; h: number }>,
    isSelecting: Ref<boolean>,
    selectStart: Ref<{ x: number; y: number }>,
    selectCurrent: Ref<{ x: number; y: number }>,
    gridSnapEnabled: Ref<boolean>,
    gridStep: Ref<number>,
    moveWidgetWithChildren: (rootId: number, dx: number, dy: number) => void,
    pushHistory: () => void,
    uiZoom: Ref<number>
) {
    // 选择框性能优化：使用 requestAnimationFrame 节流
    const selectionRectRef = ref<HTMLElement | null>(null);
    let rafId: number | null = null;

    const startDrag = (widget: Widget, ev: MouseEvent) => {
        const canvas = canvasRef.value;
        if (!canvas || !widget) return;

        // 按住空格时，无论点到哪里（包括控件上），都进入画布平移模式
        if (isSpacePressed.value) {
            isPanning.value = true;
            panStart.value = {
                x: ev.clientX,
                y: ev.clientY,
                panX: panX.value,
                panY: panY.value,
            };
            ev.preventDefault();
            return;
        }

        // 先处理选择逻辑（锁定也允许被选中）
        const isCtrl = ev && (ev.ctrlKey || ev.metaKey);
        if (isCtrl) {
            const set = new Set(selectedIds.value);
            if (set.has(widget.id)) {
                set.delete(widget.id);
            } else {
                set.add(widget.id);
            }
            selectedIds.value = Array.from(set);
        } else {
            // 如果当前已经是多选，并且包含这个控件，则保留多选；否则重置为单选
            if (!selectedIds.value.includes(widget.id)) {
                selectedIds.value = [widget.id];
            }
        }

        // 锁定：不允许拖动位置
        if (widget.locked) return;

        // 拖动前记录历史，整次拖动可以通过一次撤销恢复
        pushHistory();
        const rect = canvas.getBoundingClientRect();
        const uiScale = uiZoom.value || 1;
        const screenX = (ev.clientX - rect.left) / uiScale;
        const screenY = (ev.clientY - rect.top) / uiScale;
        const scale = canvasScale.value || 1;
        const mouseX = (screenX - (panX.value || 0)) / scale;
        const mouseY = (screenY - (panY.value || 0)) / scale;

        draggingId.value = widget.id;
        dragOffset.value = {
            x: (mouseX || 0) - (widget.x || 0),
            y: (mouseY || 0) - (widget.y || 0),
        };
    };

    const startResize = (widget: Widget, ev: MouseEvent) => {
        const canvas = canvasRef.value;
        if (!canvas || !widget) return;

        // 锁定：不允许调整大小
        if (widget.locked) return;

        // 调整大小前记录历史
        pushHistory();
        const rect = canvas.getBoundingClientRect();
        const uiScale = uiZoom.value || 1;
        const screenX = (ev.clientX - rect.left) / uiScale;
        const screenY = (ev.clientY - rect.top) / uiScale;
        const scale = canvasScale.value || 1;
        const mouseX = (screenX - (panX.value || 0)) / scale;
        const mouseY = (screenY - (panY.value || 0)) / scale;

        resizingId.value = widget.id;
        resizeStart.value = {
            mouseX: mouseX || 0,
            mouseY: mouseY || 0,
            w: widget.w || 0,
            h: widget.h || 0,
        };
        selectedIds.value = [widget.id];
    };

    const onCanvasMouseDown = (ev: MouseEvent) => {
        const canvas = canvasRef.value;
        if (!canvas) return;

        if (isSpacePressed.value) {
            isPanning.value = true;
            panStart.value = {
                x: ev.clientX,
                y: ev.clientY,
                panX: panX.value,
                panY: panY.value,
            };
            ev.preventDefault();
            return;
        }

        const target = ev.target as HTMLElement;
        if (target === canvas || target.classList.contains('canvas-inner')) {
            const rect = canvas.getBoundingClientRect();
            const uiScale = uiZoom.value || 1;
            const screenX = (ev.clientX - rect.left) / uiScale;
            const screenY = (ev.clientY - rect.top) / uiScale;
            const scale = canvasScale.value || 1;
            const x = (screenX - (panX.value || 0)) / scale;
            const y = (screenY - (panY.value || 0)) / scale;
            isSelecting.value = true;
            selectStart.value = { x: x || 0, y: y || 0 };
            selectCurrent.value = { x: x || 0, y: y || 0 };
            selectedIds.value = [];
        }
    };

    const onCanvasMouseMove = (ev: MouseEvent) => {
        const canvas = canvasRef.value;
        if (!canvas) return;

        if (isPanning.value) {
            const dx = ev.clientX - panStart.value.x;
            const dy = ev.clientY - panStart.value.y;
            panX.value = panStart.value.panX + dx;
            panY.value = panStart.value.panY + dy;
            ev.preventDefault();
            return;
        }

        const rect = canvas.getBoundingClientRect();
        const uiScale = uiZoom.value || 1;
        const screenX = (ev.clientX - rect.left) / uiScale;
        const screenY = (ev.clientY - rect.top) / uiScale;

        if (isSelecting.value) {
            // 使用 requestAnimationFrame 优化性能，避免频繁更新
            if (rafId !== null) {
                cancelAnimationFrame(rafId);
            }
            rafId = requestAnimationFrame(() => {
                const screenXAdjusted = screenX;
                const screenYAdjusted = screenY;
                const scale = canvasScale.value || 1;
                selectCurrent.value = {
                    x: (screenXAdjusted - (panX.value || 0)) / scale,
                    y: (screenYAdjusted - (panY.value || 0)) / scale
                };
                rafId = null;
            });
            return;
        }

        const screenXAdjusted = screenX;
        const screenYAdjusted = screenY;
        const scale = canvasScale.value || 1;
        const mouseX = (screenXAdjusted - (panX.value || 0)) / scale;
        const mouseY = (screenYAdjusted - (panY.value || 0)) / scale;

        if (resizingId.value != null) {
            const w = widgetsList.value.find((x) => x.id === resizingId.value);
            if (!w) return;
            const startX = resizeStart.value.mouseX || 0;
            const startY = resizeStart.value.mouseY || 0;
            let dw = (mouseX || 0) - startX;
            let dh = (mouseY || 0) - startY;
            let newW = (resizeStart.value.w || 0) + dw;
            let newH = (resizeStart.value.h || 0) + dh;
            if (gridSnapEnabled.value) {
                const step = gridStep.value || 10;
                newW = Math.max(10, Math.round(newW / step) * step);
                newH = Math.max(10, Math.round(newH / step) * step);
            }
            w.w = Math.max(1, newW);
            w.h = Math.max(1, newH);
            return;
        }

        if (!draggingId.value) return;

        const w = widgetsList.value.find((x) => x.id === draggingId.value);
        if (!w) return;
        const offsetX = dragOffset.value.x || 0;
        const offsetY = dragOffset.value.y || 0;
        let nx = (mouseX || 0) - offsetX;
        let ny = (mouseY || 0) - offsetY;
        if (gridSnapEnabled.value) {
            const step = gridStep.value || 10;
            nx = Math.round(nx / step) * step;
            ny = Math.round(ny / step) * step;
        }
        const dx = (nx || 0) - (w.x || 0);
        const dy = (ny || 0) - (w.y || 0);
        if (!isNaN(dx) && !isNaN(dy)) {
            const selectedSet = new Set(selectedIds.value);
            // 多选时：一起移动所有选中的"根"控件（父节点不在选中集合中）
            if (selectedSet.size > 1 && selectedSet.has(draggingId.value)) {
                const rootIds: number[] = [];
                selectedIds.value.forEach((id) => {
                    const item = widgetsList.value.find((ww) => ww.id === id);
                    if (!item) return;
                    if (item.parentId == null || !selectedSet.has(item.parentId)) {
                        rootIds.push(id);
                    }
                });
                rootIds.forEach((rootId) => moveWidgetWithChildren(rootId, dx, dy));
            } else {
                // 单选：只移动当前拖动的控件及其子节点
                moveWidgetWithChildren(draggingId.value, dx, dy);
            }
        }
    };

    const onCanvasMouseUp = () => {
        if (isPanning.value) {
            isPanning.value = false;
            return;
        }

        if (isSelecting.value) {
            // 取消未完成的动画帧
            if (rafId !== null) {
                cancelAnimationFrame(rafId);
                rafId = null;
            }
            isSelecting.value = false;
            const x1 = Math.min(selectStart.value.x, selectCurrent.value.x);
            const y1 = Math.min(selectStart.value.y, selectCurrent.value.y);
            const x2 = Math.max(selectStart.value.x, selectCurrent.value.x);
            const y2 = Math.max(selectStart.value.y, selectCurrent.value.y);
            const ids: number[] = [];
            widgetsList.value.forEach((w) => {
                const wx1 = w.x;
                const wy1 = w.y;
                const wx2 = w.x + w.w;
                const wy2 = w.y + w.h;
                const overlap = wx1 <= x2 && wx2 >= x1 && wy1 <= y2 && wy2 >= y1;
                if (overlap) ids.push(w.id);
            });
            selectedIds.value = ids;
            return;
        }

        resizingId.value = null;
        draggingId.value = null;
    };

    return {
        selectionRectRef,
        startDrag,
        startResize,
        onCanvasMouseDown,
        onCanvasMouseMove,
        onCanvasMouseUp,
    };
}

