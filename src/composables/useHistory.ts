import { ref, type Ref } from 'vue';
import type { Widget } from '../types';

export function useHistory(widgetsList: Ref<Widget[]>, selectedIds: Ref<number[]>) {
    // 历史记录栈
    const historyStack = ref<string[]>([]);
    const futureStack = ref<string[]>([]);

    // 创建布局快照
    const snapshotLayout = (): string => JSON.stringify(widgetsList.value);

    // 恢复布局
    const restoreLayout = (snap: string) => {
        try {
            const arr = JSON.parse(snap) as Widget[];
            if (Array.isArray(arr)) {
                widgetsList.value = arr;
                selectedIds.value = [];
            }
        } catch (e) {
            console.warn('恢复布局失败', e);
        }
    };

    // 推入历史记录
    const pushHistory = () => {
        historyStack.value.push(snapshotLayout());
        if (historyStack.value.length > 100) {
            historyStack.value.shift();
        }
        futureStack.value = [];
    };

    // 撤销
    const undoLayout = () => {
        if (!historyStack.value.length) return;
        const current = snapshotLayout();
        const prev = historyStack.value.pop();
        if (prev) {
            futureStack.value.push(current);
            restoreLayout(prev);
        }
    };

    // 重做
    const redoLayout = () => {
        if (!futureStack.value.length) return;
        const current = snapshotLayout();
        const next = futureStack.value.pop();
        if (next) {
            historyStack.value.push(current);
            restoreLayout(next);
        }
    };

    // 清空历史记录
    const clearHistory = () => {
        historyStack.value = [];
        futureStack.value = [];
    };

    return {
        historyStack,
        futureStack,
        pushHistory,
        undoLayout,
        redoLayout,
        clearHistory,
    };
}

