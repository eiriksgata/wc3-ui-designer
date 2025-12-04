import { ref, computed } from 'vue';

export function useGrid(settings) {
    const gridMode = ref(0); // 0=关闭，1=128*128，2=64*64，3=32*32
    const gridSnapEnabled = ref(true);

    const gridStep = computed(() => {
        if (gridMode.value === 1) return 128;
        if (gridMode.value === 2) return 64;
        if (gridMode.value === 3) return 32;
        return settings.value.gridSnapStep;
    });

    const gridXTicks = computed(() => {
        if (gridMode.value === 0) return [];
        const step = gridStep.value;
        const width = settings.value.canvasWidth;
        const count = Math.floor(width / step) + 1;
        return Array.from({ length: count }, (_, i) => i * step);
    });

    const gridYTicks = computed(() => {
        if (gridMode.value === 0) return [];
        const step = gridStep.value;
        const height = settings.value.canvasHeight;
        const count = Math.floor(height / step) + 1;
        return Array.from({ length: count }, (_, i) => i * step);
    });

    const toggleGridSnap = () => {
        gridSnapEnabled.value = !gridSnapEnabled.value;
    };

    return {
        gridMode,
        gridSnapEnabled,
        gridStep,
        gridXTicks,
        gridYTicks,
        toggleGridSnap,
    };
}

