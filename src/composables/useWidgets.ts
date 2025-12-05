import { ref, computed, type Ref } from 'vue';
import type { Widget } from '../types';

export function useWidgets() {
    const widgets: Ref<Widget[]> = ref([]);
    const nextId = ref(1);
    const selectedIds = ref<number[]>([]);
    const draggingId = ref<number | null>(null);
    const dragOffset = ref({ x: 0, y: 0 });
    const resizingId = ref<number | null>(null);
    const resizeStart = ref({ mouseX: 0, mouseY: 0, w: 0, h: 0 });
    const isSelecting = ref(false);
    const selectStart = ref({ x: 0, y: 0 });
    const selectCurrent = ref({ x: 0, y: 0 });

    const selectedWidget = computed(() => {
        const id = selectedIds.value[0];
        return widgets.value.find((w) => w.id === id) || null;
    });

    const parentCandidates = computed(() => {
        if (!selectedWidget.value) return widgets.value;
        const currentId = selectedWidget.value.id;
        return widgets.value.filter((w) => w.id !== currentId);
    });

    // 渲染顺序：父节点在前，子节点在后（子节点显示在父节点上层）
    const renderWidgets = computed(() => {
        const result: Widget[] = [];
        const visit = (w: Widget) => {
            result.push(w);
            widgets.value
                .filter((child) => child.parentId === w.id)
                .forEach((child) => visit(child));
        };
        widgets.value
            .filter((w) => w.parentId == null)
            .forEach((w) => visit(w));
        // 孤立节点（父节点不存在）也要绘制
        widgets.value
            .filter((w) => w.parentId != null && !result.includes(w))
            .forEach((w) => result.push(w));
        return result;
    });

    const selectionStyle = computed(() => {
        if (!isSelecting.value) return {};
        const x1 = Math.min(selectStart.value.x, selectCurrent.value.x);
        const y1 = Math.min(selectStart.value.y, selectCurrent.value.y);
        const x2 = Math.max(selectStart.value.x, selectCurrent.value.x);
        const y2 = Math.max(selectStart.value.y, selectCurrent.value.y);
        return {
            left: `${x1}px`,
            top: `${y1}px`,
            width: `${x2 - x1}px`,
            height: `${y2 - y1}px`,
        };
    });

    const addWidget = (type: string) => {
        const id = nextId.value++;
        let defaultText = '';
        if (type === 'text') {
            defaultText = '文本';
        } else if (type === 'button') {
            defaultText = '按钮';
        }
        widgets.value.push({
            id,
            name: `${type}_${id}`,
            type,
            parentId: null,
            // 基础属性
            x: 960,
            y: 540,
            w: 100,
            h: 100,
            enable: true,
            visible: true,
            locked: false,
            // 文本属性（仅在文本类控件中使用）
            font: '', // 字体/字体文件名
            fontSize: 14, // 字体大小（编辑器中的像素大小，导出时可自行换算）
            outlineSize: 0, // 描边宽度
            textAlign: 'top_left', // 文本对齐方式
            // 通用
            text: defaultText,
            image: '',
            // 按钮专用
            clickImage: '',
            hoverImage: '',
            draggable: false,
            // 旧属性（部分控件使用）
            checked: false,
            selectedIndex: 0,
        });
        selectedIds.value = [id];
    };

    const moveWidgetWithChildren = (rootId: number, dx: number, dy: number) => {
        const move = (id: number) => {
            const node = widgets.value.find((w) => w.id === id);
            if (!node) return;
            const newX = (node.x || 0) + (dx || 0);
            const newY = (node.y || 0) + (dy || 0);
            if (!isNaN(newX) && !isNaN(newY)) {
                node.x = newX;
                node.y = newY;
            }
            widgets.value
                .filter((w) => w.parentId === id)
                .forEach((child) => move(child.id));
        };
        move(rootId);
    };

    const clearAll = () => {
        widgets.value = [];
        selectedIds.value = [];
        nextId.value = 1;
    };

    const deleteSelected = () => {
        const toDelete = new Set(selectedIds.value);
        const deleteRecursive = (id: number) => {
            toDelete.add(id);
            widgets.value
                .filter((w) => w.parentId === id)
                .forEach((child) => deleteRecursive(child.id));
        };
        selectedIds.value.forEach((id) => deleteRecursive(id));
        widgets.value = widgets.value.filter((w) => !toDelete.has(w.id));
        selectedIds.value = [];
    };

    return {
        widgets,
        nextId,
        selectedIds,
        draggingId,
        dragOffset,
        resizingId,
        resizeStart,
        isSelecting,
        selectStart,
        selectCurrent,
        selectedWidget,
        parentCandidates,
        renderWidgets,
        selectionStyle,
        addWidget,
        moveWidgetWithChildren,
        clearAll,
        deleteSelected,
    };
}

