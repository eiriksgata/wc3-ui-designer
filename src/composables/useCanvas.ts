import { ref, computed, watch, type Ref } from 'vue';
import type { Settings } from '../types';
import {
    CANVAS_SCALE_MAX,
    CANVAS_SCALE_MIN,
    CANVAS_EDGE_KEEP_PX,
    clampPanToBounds,
    computeFitCanvasView,
} from './canvasViewBounds';

export function useCanvas(settings: Ref<Settings>, uiZoom: Ref<number>) {
    const canvasRef = ref<HTMLElement | null>(null);
    const canvasSize = ref({ width: 0, height: 0 });
    const canvasScale = ref(1);
    const panX = ref(0);
    const panY = ref(0);
    const isSpacePressed = ref(false);
    const isPanning = ref(false);
    const panStart = ref({ x: 0, y: 0, panX: 0, panY: 0 });

    const canvasLogicalWidth = computed(() => settings.value.canvasWidth);
    const canvasLogicalHeight = computed(() => settings.value.canvasHeight);

    const layoutViewport = () => {
        const vz = uiZoom.value || 1;
        return {
            w: canvasSize.value.width / vz,
            h: canvasSize.value.height / vz,
        };
    };

    const clampCanvasPan = () => {
        const { w: vw, h: vh } = layoutViewport();
        if (vw <= 0 || vh <= 0) return;
        const lw = settings.value.canvasWidth;
        const lh = settings.value.canvasHeight;
        const c = clampPanToBounds(
            panX.value,
            panY.value,
            canvasScale.value,
            lw,
            lh,
            vw,
            vh,
            CANVAS_EDGE_KEEP_PX,
        );
        panX.value = c.panX;
        panY.value = c.panY;
    };

    const fitCanvasToView = () => {
        const { w: vw, h: vh } = layoutViewport();
        if (vw <= 0 || vh <= 0) return;
        const lw = settings.value.canvasWidth;
        const lh = settings.value.canvasHeight;
        if (lw <= 0 || lh <= 0) return;
        const f = computeFitCanvasView(lw, lh, vw, vh);
        canvasScale.value = f.scale;
        panX.value = f.panX;
        panY.value = f.panY;
    };

    watch(uiZoom, () => {
        clampCanvasPan();
    });

    watch(
        () => [settings.value.canvasWidth, settings.value.canvasHeight] as const,
        () => {
            fitCanvasToView();
        },
    );

    const onCanvasWheel = (ev: WheelEvent) => {
        // 只有按 Ctrl 时才缩放画布，并阻止浏览器默认缩放
        if (ev.ctrlKey || ev.metaKey) {
            ev.preventDefault();
            const delta = ev.deltaY;
            const factor = delta > 0 ? 0.9 : 1.1;
            let next = canvasScale.value * factor;
            if (next < CANVAS_SCALE_MIN) next = CANVAS_SCALE_MIN;
            if (next > CANVAS_SCALE_MAX) next = CANVAS_SCALE_MAX;
            canvasScale.value = next;
            clampCanvasPan();
        }
    };

    return {
        canvasRef,
        canvasSize,
        canvasScale,
        panX,
        panY,
        isSpacePressed,
        isPanning,
        panStart,
        canvasLogicalWidth,
        canvasLogicalHeight,
        onCanvasWheel,
        clampCanvasPan,
        fitCanvasToView,
    };
}

