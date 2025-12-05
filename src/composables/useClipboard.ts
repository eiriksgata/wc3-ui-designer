import { ref, type Ref, type ComputedRef } from 'vue';
import type { Widget } from '../types';

export function useClipboard(
    selectedWidget: ComputedRef<Widget | null>,
    widgetsList: Ref<Widget[]>,
    selectedIds: Ref<number[]>,
    nextId: Ref<number>,
    pushHistory: () => void
) {
    const clipboard = ref<Widget | null>(null);

    const copySelection = () => {
        if (!selectedWidget.value) return;
        clipboard.value = JSON.parse(JSON.stringify(selectedWidget.value)) as Widget;
    };

    const pasteClipboard = () => {
        if (!clipboard.value) return;
        const data = JSON.parse(JSON.stringify(clipboard.value)) as Widget;
        const id = nextId.value++;
        const offset = 20;
        const newWidget: Widget = {
            ...data,
            id,
            x: (data.x || 0) + offset,
            y: (data.y || 0) + offset,
        };
        widgetsList.value.push(newWidget);
        selectedIds.value = [id];
    };

    const pasteClipboardWithHistory = () => {
        pushHistory();
        pasteClipboard();
    };

    return {
        clipboard,
        copySelection,
        pasteClipboard,
        pasteClipboardWithHistory,
    };
}

