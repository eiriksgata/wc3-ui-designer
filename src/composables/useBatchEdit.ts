import { ref, type Ref } from 'vue';
import type { Widget } from '../types';

export function useBatchEdit(
    widgetsList: Ref<Widget[]>,
    selectedIds: Ref<number[]>,
    pushHistory: () => void,
    moveWidgetWithChildren: (rootId: number, dx: number, dy: number) => void,
    supportsImage: (type: string) => boolean
) {
    const batchMove = ref({ dx: 0, dy: 0 });
    const batchSize = ref<{ w: number | null; h: number | null }>({ w: null, h: null });
    const batchText = ref('');
    const batchImage = ref('');

    const applyBatchMove = () => {
        const dx = batchMove.value.dx || 0;
        const dy = batchMove.value.dy || 0;
        if (!dx && !dy) return;
        if (!selectedIds.value.length) return;
        pushHistory();
        const set = new Set(selectedIds.value);
        const rootIds: number[] = [];
        widgetsList.value.forEach((w) => {
            if (set.has(w.id) && (w.parentId == null || !set.has(w.parentId))) {
                rootIds.push(w.id);
            }
        });
        rootIds.forEach((id) => moveWidgetWithChildren(id, dx, dy));
    };

    const applyBatchSize = () => {
        const w = batchSize.value.w;
        const h = batchSize.value.h;
        if (w == null && h == null) return;
        if (!selectedIds.value.length) return;
        pushHistory();
        widgetsList.value.forEach((wd) => {
            if (!selectedIds.value.includes(wd.id)) return;
            if (w != null && !isNaN(w)) wd.w = Math.max(1, w);
            if (h != null && !isNaN(h)) wd.h = Math.max(1, h);
        });
    };

    const applyBatchText = () => {
        const txt = batchText.value;
        if (txt === '') return; // 空字符串表示不修改
        if (!selectedIds.value.length) return;
        pushHistory();
        widgetsList.value.forEach((wd) => {
            if (!selectedIds.value.includes(wd.id)) return;
            // 只对有 text 字段的控件生效
            if (Object.prototype.hasOwnProperty.call(wd, 'text')) {
                wd.text = txt;
            }
        });
    };

    const applyBatchImage = () => {
        const img = batchImage.value;
        if (!img) return; // 空表示不修改
        if (!selectedIds.value.length) return;
        pushHistory();
        widgetsList.value.forEach((wd) => {
            if (!selectedIds.value.includes(wd.id)) return;
            // 只对支持图片的类型生效
            if (supportsImage(wd.type)) {
                wd.image = img;
            }
        });
    };

    return {
        batchMove,
        batchSize,
        batchText,
        batchImage,
        applyBatchMove,
        applyBatchSize,
        applyBatchText,
        applyBatchImage,
    };
}

