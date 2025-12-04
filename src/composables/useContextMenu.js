import { ref } from 'vue';

export function useContextMenu(canvasRef, uiZoom, selectedIds) {
    const contextMenu = ref({
        visible: false,
        x: 0,
        y: 0,
    });

    const closeContextMenu = () => {
        contextMenu.value.visible = false;
    };

    const openContextMenu = (x, y) => {
        contextMenu.value = {
            visible: true,
            x,
            y,
        };
    };

    const onWidgetContextMenu = (widget, ev) => {
        selectedIds.value = [widget.id];
        const canvas = canvasRef.value;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const uiScale = uiZoom.value || 1;
        const x = (ev.clientX - rect.left) / uiScale;
        const y = (ev.clientY - rect.top) / uiScale;
        openContextMenu(x, y);
    };

    const onCanvasContextMenu = (ev) => {
        // 右键画布空白处，不改变当前选中，只弹出菜单
        const canvas = canvasRef.value;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const uiScale = uiZoom.value || 1;
        const x = (ev.clientX - rect.left) / uiScale;
        const y = (ev.clientY - rect.top) / uiScale;
        openContextMenu(x, y);
    };

    return {
        contextMenu,
        closeContextMenu,
        openContextMenu,
        onWidgetContextMenu,
        onCanvasContextMenu,
    };
}

