import { ref, computed, type Ref } from 'vue';
import type { Settings } from '../types';

export function useCanvas(settings: Ref<Settings>) {
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

    const onCanvasWheel = (ev: WheelEvent) => {
        // 只有按 Ctrl 时才缩放画布，并阻止浏览器默认缩放
        if (ev.ctrlKey || ev.metaKey) {
            ev.preventDefault();
            const delta = ev.deltaY;
            const factor = delta > 0 ? 0.9 : 1.1;
            let next = canvasScale.value * factor;
            if (next < 0.2) next = 0.2;
            if (next > 3) next = 3;
            canvasScale.value = next;
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
    };
}

