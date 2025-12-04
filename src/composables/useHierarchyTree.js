import { ref, computed, nextTick } from 'vue';

export function useHierarchyTree(
    widgetsList,
    selectedIds,
    nextId,
    pushHistory,
    message,
    uiZoom,
    leftPanelRef
) {
    const hierarchyPanelRef = ref(null);
    const treeDragPreviewPos = ref({ x: 0, y: 0 });
    const treeDragClickOffsetY = ref(0);

    const treeExpanded = ref({}); // id -> boolean（undefined 视为展开）
    const isTreeNodeExpanded = (id) =>
        treeExpanded.value[id] !== false;

    const toggleTreeNode = (id) => {
        const current = treeExpanded.value[id];
        treeExpanded.value = {
            ...treeExpanded.value,
            [id]: current === false,
        };
    };

    const widgetTreeFlat = computed(() => {
        const items = widgetsList.value.map((w) => ({
            id: w.id,
            name: w.name,
            type: w.type,
            parentId: w.parentId,
            children: [],
        }));
        const map = new Map();
        items.forEach((n) => map.set(n.id, n));
        const roots = [];
        items.forEach((n) => {
            if (n.parentId != null && map.has(n.parentId)) {
                map.get(n.parentId).children.push(n);
            } else {
                roots.push(n);
            }
        });
        const flat = [];
        const visit = (node, depth) => {
            const hasChildren = node.children.length > 0;
            flat.push({ ...node, depth, hasChildren });
            if (hasChildren && isTreeNodeExpanded(node.id)) {
                node.children.forEach((child) => visit(child, depth + 1));
            }
        };
        roots.forEach((r) => visit(r, 0));
        return flat;
    });

    const dragPreviewNode = computed(() => {
        if (treeDragSourceId.value == null) return null;
        return widgetTreeFlat.value.find((n) => n.id === treeDragSourceId.value) || null;
    });

    // 树节点点击：支持 Ctrl 多选
    const selectFromTree = (id, ev) => {
        const isCtrl = ev && (ev.ctrlKey || ev.metaKey);
        if (isCtrl) {
            const set = new Set(selectedIds.value);
            if (set.has(id)) {
                set.delete(id); // 再次点击可取消选中
            } else {
                set.add(id);
            }
            selectedIds.value = Array.from(set);
        } else {
            selectedIds.value = [id];
        }
    };

    // 判断是否是祖先关系，防止把父节点拖到自己的子节点下面
    const isDescendantOf = (ancestorId, maybeDescendantId) => {
        let current = widgetsList.value.find((w) => w.id === maybeDescendantId);
        const safetyLimit = 1000;
        let guard = 0;
        while (current && current.parentId != null && guard++ < safetyLimit) {
            if (current.parentId === ancestorId) return true;
            current = widgetsList.value.find((w) => w.id === current.parentId);
        }
        return false;
    };

    const updateWidgetParent = (id, newParentId) => {
        const idx = widgetsList.value.findIndex((w) => w.id === id);
        if (idx === -1) return;
        const old = widgetsList.value[idx];
        // 使用新对象替换，确保在某些环境下的响应性更新
        widgetsList.value[idx] = {
            ...old,
            parentId: newParentId,
        };
    };

    // 树拖动调整层级：用鼠标 mousedown + mousemove + mouseup + elementFromPoint 实现
    const treeDragSourceId = ref(null);
    const treeDragStartPos = ref({ x: 0, y: 0 });
    const treeIsDragging = ref(false);
    const TREE_DRAG_THRESHOLD = 4; // 像素阈值，避免误触

    const onTreeMouseDown = (id, ev) => {
        if (ev.button !== 0) return; // 只响应左键
        // 正在重命名时不处理拖动
        if (treeRenameId.value != null) return;
        treeDragSourceId.value = id;
        treeDragStartPos.value = { x: ev.clientX, y: ev.clientY };
        treeIsDragging.value = false;
        const panelEl = hierarchyPanelRef.value;
        const itemEl = ev.currentTarget;
        if (panelEl && itemEl instanceof HTMLElement) {
            const panelRect = panelEl.getBoundingClientRect();
            const itemRect = itemEl.getBoundingClientRect();
            treeDragClickOffsetY.value = ev.clientY - itemRect.top;
            treeDragPreviewPos.value = {
                x: itemRect.left - panelRect.left,
                y: itemRect.top - panelRect.top,
            };
        }
        // 按下时先给一个抓手形状
        try {
            document.body.style.cursor = 'grab';
        } catch (e) { }
        document.addEventListener('mousemove', onTreeMouseMove);
        document.addEventListener('mouseup', onTreeMouseUp, { once: true });
    };

    const onTreeMouseMove = (ev) => {
        if (!treeDragSourceId.value) return;
        const dx = ev.clientX - treeDragStartPos.value.x;
        const dy = ev.clientY - treeDragStartPos.value.y;
        if (!treeIsDragging.value) {
            if (Math.abs(dx) > TREE_DRAG_THRESHOLD || Math.abs(dy) > TREE_DRAG_THRESHOLD) {
                treeIsDragging.value = true;
                // 真正进入拖动时，改成移动光标
                try {
                    document.body.style.cursor = 'grabbing';
                } catch (e) { }
            } else {
                return;
            }
        }
        const panelEl = hierarchyPanelRef.value;
        if (panelEl) {
            const panelRect = panelEl.getBoundingClientRect();
            treeDragPreviewPos.value = {
                x: ev.clientX - panelRect.left,
                y: ev.clientY - panelRect.top - treeDragClickOffsetY.value,
            };
        }
    };

    const onTreeMouseUp = (ev) => {
        document.removeEventListener('mousemove', onTreeMouseMove);
        const srcId = treeDragSourceId.value;
        treeDragSourceId.value = null;
        // 无论是否成功拖动，都恢复鼠标形状
        try {
            document.body.style.cursor = '';
        } catch (e) { }
        if (!srcId) return;

        if (!treeIsDragging.value) {
            // 只是点击，不是拖动
            selectFromTree(srcId, ev);
            return;
        }

        const el = document.elementFromPoint(ev.clientX, ev.clientY);
        if (!el) return;

        const itemEl = el.closest('.tree-item');
        if (itemEl && itemEl.dataset && itemEl.dataset.id) {
            const targetId = Number(itemEl.dataset.id);
            if (!isNaN(targetId) && targetId !== srcId) {
                if (isDescendantOf(srcId, targetId)) {
                    message.value = '无法将父节点移动到其子节点下面';
                    treeIsDragging.value = false;
                    return;
                }
                pushHistory();
                updateWidgetParent(srcId, targetId);
                treeIsDragging.value = false;
                return;
            }
        }

        // 没命中具体节点，但在树区域内，则视为拖到根节点
        const listEl = el.closest('.hierarchy-list');
        if (listEl) {
            pushHistory();
            updateWidgetParent(srcId, null);
        }
        treeIsDragging.value = false;
    };

    // 树右键菜单 & 重命名
    const treeContextMenu = ref({
        visible: false,
        x: 0,
        y: 0,
        targetId: null,
    });

    const treeRenameId = ref(null);
    const treeRenameName = ref('');
    const treeRenameInputRef = ref(null);

    const onTreeContextMenu = (node, ev) => {
        const panel = leftPanelRef.value;
        if (!panel) return;
        const rect = panel.getBoundingClientRect();
        const uiScale = uiZoom.value || 1;
        const x = (ev.clientX - rect.left) / uiScale;
        const y = (ev.clientY - rect.top) / uiScale;
        treeContextMenu.value = {
            visible: true,
            x,
            y,
            targetId: node.id,
        };
    };

    const closeTreeContextMenu = () => {
        treeContextMenu.value.visible = false;
    };

    const startTreeRename = (node) => {
        treeRenameId.value = node.id;
        treeRenameName.value = node.name || '';
        nextTick(() => {
            const refVal = treeRenameInputRef.value;
            const el = Array.isArray(refVal) ? refVal[0] : refVal;
            if (el && typeof el.focus === 'function') {
                el.focus();
                if (typeof el.select === 'function') {
                    el.select();
                }
            }
        });
    };

    const handleTreeContextRename = () => {
        const id = treeContextMenu.value.targetId;
        closeTreeContextMenu();
        const node = widgetTreeFlat.value.find((n) => n.id === id);
        if (node) {
            startTreeRename(node);
        }
    };

    const confirmTreeRename = () => {
        const id = treeRenameId.value;
        if (!id) return;
        const w = widgetsList.value.find((w) => w.id === id);
        if (w) {
            pushHistory();
            w.name = treeRenameName.value.trim() || w.name;
        }
        treeRenameId.value = null;
    };

    const handleTreeSetRoot = () => {
        const id = treeContextMenu.value.targetId;
        closeTreeContextMenu();
        if (!id) return;
        const w = widgetsList.value.find((w) => w.id === id);
        if (!w) return;
        pushHistory();
        w.parentId = null;
    };

    const handleTreeDelete = () => {
        const id = treeContextMenu.value.targetId;
        closeTreeContextMenu();
        if (!id) return;
        selectedIds.value = [id];
        pushHistory();
        // deleteSelected 需要在外部调用
        return id;
    };

    return {
        hierarchyPanelRef,
        treeDragPreviewPos,
        treeDragClickOffsetY,
        treeExpanded,
        isTreeNodeExpanded,
        toggleTreeNode,
        widgetTreeFlat,
        dragPreviewNode,
        selectFromTree,
        isDescendantOf,
        updateWidgetParent,
        treeDragSourceId,
        treeDragStartPos,
        treeIsDragging,
        onTreeMouseDown,
        onTreeMouseMove,
        onTreeMouseUp,
        treeContextMenu,
        treeRenameId,
        treeRenameName,
        treeRenameInputRef,
        onTreeContextMenu,
        closeTreeContextMenu,
        startTreeRename,
        handleTreeContextRename,
        confirmTreeRename,
        handleTreeSetRoot,
        handleTreeDelete,
    };
}

