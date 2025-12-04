import { ref } from 'vue';

export function useClipboard(selectedWidget, widgetsList, selectedIds, nextId, pushHistory) {
    const clipboard = ref(null);

    const copySelection = () => {
        if (!selectedWidget.value) return;
        clipboard.value = JSON.parse(JSON.stringify(selectedWidget.value));
    };

    const pasteClipboard = () => {
        if (!clipboard.value) return;
        const data = JSON.parse(JSON.stringify(clipboard.value));
        const id = nextId.value++;
        const offset = 20;
        const newWidget = {
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

