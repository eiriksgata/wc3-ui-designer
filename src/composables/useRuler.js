import { computed } from 'vue';

export function useRuler(settings, canvasSize, canvasScale, panX, panY) {
    const rulerStep = computed(() => settings.value.rulerStep);
    const canvasLogicalWidth = computed(() => settings.value.canvasWidth);
    const canvasLogicalHeight = computed(() => settings.value.canvasHeight);

    // 计算水平标尺可见的刻度范围
    const rulerXTicks = computed(() => {
        if (!canvasSize.value || !canvasSize.value.width || canvasScale.value === 0) return [];

        // 计算可见区域对应的世界坐标范围
        const scale = canvasScale.value || 1;
        const rulerStartX = -panX.value / scale;
        const rulerEndX = (canvasSize.value.width - 26 - panX.value) / scale;

        // 计算需要显示的刻度范围（扩展一些范围以确保完整显示）
        const step = rulerStep.value || 50;
        const startTick = Math.floor(rulerStartX / step) * step - step;
        const endTick = Math.ceil(rulerEndX / step) * step + step;

        const ticks = [];
        for (let x = startTick; x <= endTick; x += step) {
            ticks.push(x);
        }
        return ticks;
    });

    // 计算垂直标尺可见的刻度范围
    const rulerYTicks = computed(() => {
        if (!canvasSize.value || !canvasSize.value.height || canvasScale.value === 0) return [];

        // 计算可见区域对应的世界坐标范围
        const scale = canvasScale.value || 1;
        const rulerStartY = -panY.value / scale;
        const rulerEndY = (canvasSize.value.height - 20 - panY.value) / scale;

        // 计算需要显示的刻度范围（扩展一些范围以确保完整显示）
        const step = rulerStep.value || 50;
        const startTick = Math.floor(rulerStartY / step) * step - step;
        const endTick = Math.ceil(rulerEndY / step) * step + step;

        const ticks = [];
        for (let y = startTick; y <= endTick; y += step) {
            ticks.push(y);
        }
        return ticks;
    });

    return {
        rulerStep,
        rulerXTicks,
        rulerYTicks,
    };
}

