import { ref, type Ref } from 'vue';
import type { Settings } from '../types';

type DragType = 'left' | 'right' | 'bottom' | null;

interface DragState {
    type: DragType;
    startX: number;
    startY: number;
    leftWidth: number;
    rightWidth: number;
    resourcesHeight: number;
}

export function usePanelResize(settings: Ref<Settings>, saveSettings: () => boolean) {
    const leftWidth = ref(settings.value.controlPanelWidth || 220);
    const rightWidth = ref(260);
    const resourcesHeight = ref(200);

    const MIN_LEFT_WIDTH = 140;
    const MAX_LEFT_WIDTH = 500;
    const MIN_RIGHT_WIDTH = 180;
    const MAX_RIGHT_WIDTH = 500;
    const MIN_RESOURCES_HEIGHT = 120;
    const MAX_RESOURCES_HEIGHT = 400;

    const dragState = ref<DragState>({
        type: null,
        startX: 0,
        startY: 0,
        leftWidth: 0,
        rightWidth: 0,
        resourcesHeight: 0,
    });

    const startDragLeft = (ev: MouseEvent) => {
        dragState.value = {
            type: 'left',
            startX: ev.clientX,
            startY: ev.clientY,
            leftWidth: leftWidth.value,
            rightWidth: rightWidth.value,
            resourcesHeight: resourcesHeight.value,
        };
        document.addEventListener('mousemove', handleDragMouseMove);
        document.addEventListener('mouseup', stopDrag);
    };

    const startDragRight = (ev: MouseEvent) => {
        dragState.value = {
            type: 'right',
            startX: ev.clientX,
            startY: ev.clientY,
            leftWidth: leftWidth.value,
            rightWidth: rightWidth.value,
            resourcesHeight: resourcesHeight.value,
        };
        document.addEventListener('mousemove', handleDragMouseMove);
        document.addEventListener('mouseup', stopDrag);
    };

    const startDragBottom = (ev: MouseEvent) => {
        dragState.value = {
            type: 'bottom',
            startX: ev.clientX,
            startY: ev.clientY,
            leftWidth: leftWidth.value,
            rightWidth: rightWidth.value,
            resourcesHeight: resourcesHeight.value,
        };
        document.addEventListener('mousemove', handleDragMouseMove);
        document.addEventListener('mouseup', stopDrag);
    };

    const handleDragMouseMove = (ev: MouseEvent) => {
        const s = dragState.value;
        if (!s.type) return;
        const dx = ev.clientX - s.startX;
        const dy = ev.clientY - s.startY;

        if (s.type === 'left') {
            let w = s.leftWidth + dx;
            w = Math.min(MAX_LEFT_WIDTH, Math.max(MIN_LEFT_WIDTH, w));
            leftWidth.value = w;
            settings.value.controlPanelWidth = w;
        } else if (s.type === 'right') {
            let w = s.rightWidth - dx; // 向左拖动增加右侧宽度
            w = Math.min(MAX_RIGHT_WIDTH, Math.max(MIN_RIGHT_WIDTH, w));
            rightWidth.value = w;
        } else if (s.type === 'bottom') {
            let h = s.resourcesHeight - dy; // 向上拖动增加高度
            h = Math.min(MAX_RESOURCES_HEIGHT, Math.max(MIN_RESOURCES_HEIGHT, h));
            resourcesHeight.value = h;
        }
    };

    const stopDrag = () => {
        dragState.value.type = null;
        document.removeEventListener('mousemove', handleDragMouseMove);
        document.removeEventListener('mouseup', stopDrag);
        // 控制面板宽度拖动结束后保存到设置
        try {
            saveSettings();
        } catch (e) {
            console.warn('保存面板尺寸到设置失败', e);
        }
    };

    return {
        leftWidth,
        rightWidth,
        resourcesHeight,
        startDragLeft,
        startDragRight,
        startDragBottom,
    };
}

