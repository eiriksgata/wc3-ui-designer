import { computed, type Ref } from 'vue';
import type { Settings } from '../types';

export function useRuler(
    settings: Ref<Settings>,
    canvasSize: Ref<{ width: number; height: number }>,
    canvasScale: Ref<number>,
    panX: Ref<number>,
    panY: Ref<number>
) {
    const rulerStep = computed(() => settings.value.rulerStep);
    const canvasLogicalWidth = computed(() => settings.value.canvasWidth);
    const canvasLogicalHeight = computed(() => settings.value.canvasHeight);

    // 计算水平标尺可见的刻度范围（仅 [0, canvasWidth]，与画布内容一致；不出现画布外的负坐标）
    const rulerXTicks = computed(() => {
        if (!canvasSize.value || !canvasSize.value.width || canvasScale.value === 0) return [];

        const scale = canvasScale.value || 1;
        const rulerStartX = -panX.value / scale;
        const rulerEndX = (canvasSize.value.width - 26 - panX.value) / scale;

        const canvasW = canvasLogicalWidth.value;
        const step = rulerStep.value || 50;

        const drawStart = Math.max(0, rulerStartX);
        const drawEnd = Math.min(canvasW, rulerEndX);
        if (drawStart > drawEnd) return [];

        const startTick = Math.floor(drawStart / step) * step;
        const endTick = Math.ceil(drawEnd / step) * step;

        const ticks: number[] = [];
        for (let x = startTick; x <= endTick; x += step) {
            if (x >= 0 && x <= canvasW) {
                ticks.push(x);
            }
        }
        return ticks;
    });

    // 垂直标尺：仅 [0, canvasHeight]
    const rulerYTicks = computed(() => {
        if (!canvasSize.value || !canvasSize.value.height || canvasScale.value === 0) return [];

        const scale = canvasScale.value || 1;
        const rulerStartY = -panY.value / scale;
        const rulerEndY = (canvasSize.value.height - 20 - panY.value) / scale;

        const canvasH = canvasLogicalHeight.value;
        const step = rulerStep.value || 50;

        const drawStart = Math.max(0, rulerStartY);
        const drawEnd = Math.min(canvasH, rulerEndY);
        if (drawStart > drawEnd) return [];

        const startTick = Math.floor(drawStart / step) * step;
        const endTick = Math.ceil(drawEnd / step) * step;

        const ticks: number[] = [];
        for (let y = startTick; y <= endTick; y += step) {
            if (y >= 0 && y <= canvasH) {
                ticks.push(y);
            }
        }
        return ticks;
    });

    return {
        rulerStep,
        rulerXTicks,
        rulerYTicks,
    };
}

