import { ref, type Ref, type ComputedRef } from 'vue';
import type { Widget } from '../types';

interface ClipboardPayload {
    // 被选中的根节点（已相对自身归一化）
    root: Widget;
    // 子树里除 root 外的所有子节点（保留原 parentId -> 新根 id 的映射由 paste 处理）
    descendants: Widget[];
}

export function useClipboard(
    selectedWidget: ComputedRef<Widget | null>,
    widgetsList: Ref<Widget[]>,
    selectedIds: Ref<number[]>,
    nextId: Ref<number>,
    pushHistory: () => void,
    clampAllWidgets: () => void,
) {
    const clipboard = ref<ClipboardPayload | null>(null);

    const collectSubtree = (rootId: number): Widget[] => {
        const result: Widget[] = [];
        const visit = (id: number) => {
            widgetsList.value
                .filter((w) => w.parentId === id)
                .forEach((c) => {
                    result.push(c);
                    visit(c.id);
                });
        };
        visit(rootId);
        return result;
    };

    const copySelection = () => {
        if (!selectedWidget.value) return;
        const root = JSON.parse(JSON.stringify(selectedWidget.value)) as Widget;
        const descendants = JSON.parse(
            JSON.stringify(collectSubtree(selectedWidget.value.id)),
        ) as Widget[];
        clipboard.value = { root, descendants };
    };

    const pasteClipboard = () => {
        if (!clipboard.value) return;
        const payload = JSON.parse(JSON.stringify(clipboard.value)) as ClipboardPayload;
        const offset = 20;
        // 重分配 id：老 id -> 新 id
        const idMap = new Map<number, number>();
        const newRootId = nextId.value++;
        idMap.set(payload.root.id, newRootId);
        for (const d of payload.descendants) {
            idMap.set(d.id, nextId.value++);
        }
        const newRoot: Widget = {
            ...payload.root,
            id: newRootId,
            x: (payload.root.x || 0) + offset,
            y: (payload.root.y || 0) + offset,
        };
        widgetsList.value.push(newRoot);
        for (const d of payload.descendants) {
            const newId = idMap.get(d.id)!;
            const newParentId = d.parentId != null ? idMap.get(d.parentId) ?? null : null;
            widgetsList.value.push({
                ...d,
                id: newId,
                parentId: newParentId,
                x: (d.x || 0) + offset,
                y: (d.y || 0) + offset,
            });
        }
        selectedIds.value = [newRootId];
        clampAllWidgets();
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

