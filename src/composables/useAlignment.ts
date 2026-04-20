import { type Ref } from 'vue';
import type { Widget } from '../types';
import type { Settings } from '../types';
import { clampAllWidgetsInPlace } from './widgetCanvasBounds';

export function useAlignment(
    widgetsList: Ref<Widget[]>,
    selectedIds: Ref<number[]>,
    pushHistory: () => void,
    message: Ref<string>,
    settings: Ref<Settings>,
) {
    const clampSel = () => {
        const cw = settings.value.canvasWidth;
        const ch = settings.value.canvasHeight;
        clampAllWidgetsInPlace(widgetsList.value, cw, ch);
    };
    const alignLeft = () => {
        if (selectedIds.value.length < 2) {
            message.value = '至少选中两个控件才能对齐';
            return;
        }
        const base = widgetsList.value.find((w) => w.id === selectedIds.value[0]);
        if (!base) return;
        widgetsList.value.forEach((w) => {
            if (selectedIds.value.includes(w.id) && w.id !== base.id) {
                w.x = base.x;
            }
        });
        clampSel();
    };

    const alignTop = () => {
        if (selectedIds.value.length < 2) {
            message.value = '至少选中两个控件才能对齐';
            return;
        }
        const base = widgetsList.value.find((w) => w.id === selectedIds.value[0]);
        if (!base) return;
        widgetsList.value.forEach((w) => {
            if (selectedIds.value.includes(w.id) && w.id !== base.id) {
                w.y = base.y;
            }
        });
        clampSel();
    };

    const alignHCenter = () => {
        if (selectedIds.value.length < 2) {
            message.value = '至少选中两个控件才能对齐';
            return;
        }
        const base = widgetsList.value.find((w) => w.id === selectedIds.value[0]);
        if (!base) return;
        const baseCenter = base.x + base.w / 2;
        widgetsList.value.forEach((w) => {
            if (selectedIds.value.includes(w.id) && w.id !== base.id) {
                w.x = Math.round(baseCenter - w.w / 2);
            }
        });
        clampSel();
    };

    const alignVCenter = () => {
        if (selectedIds.value.length < 2) {
            message.value = '至少选中两个控件才能对齐';
            return;
        }
        const base = widgetsList.value.find((w) => w.id === selectedIds.value[0]);
        if (!base) return;
        const baseCenter = base.y + base.h / 2;
        widgetsList.value.forEach((w) => {
            if (selectedIds.value.includes(w.id) && w.id !== base.id) {
                w.y = Math.round(baseCenter - w.h / 2);
            }
        });
        clampSel();
    };

    const alignSameWidth = () => {
        if (selectedIds.value.length < 2) {
            message.value = '至少选中两个控件才能等宽';
            return;
        }
        const base = widgetsList.value.find((w) => w.id === selectedIds.value[0]);
        if (!base) return;
        pushHistory();
        const w0 = base.w || 0;
        widgetsList.value.forEach((w) => {
            if (selectedIds.value.includes(w.id) && w.id !== base.id) {
                w.w = w0;
            }
        });
        clampSel();
    };

    const alignSameHeight = () => {
        if (selectedIds.value.length < 2) {
            message.value = '至少选中两个控件才能等高';
            return;
        }
        const base = widgetsList.value.find((w) => w.id === selectedIds.value[0]);
        if (!base) return;
        pushHistory();
        const h0 = base.h || 0;
        widgetsList.value.forEach((w) => {
            if (selectedIds.value.includes(w.id) && w.id !== base.id) {
                w.h = h0;
            }
        });
        clampSel();
    };

    return {
        alignLeft,
        alignTop,
        alignHCenter,
        alignVCenter,
        alignSameWidth,
        alignSameHeight,
    };
}

