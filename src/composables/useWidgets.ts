import { ref, computed, watch, type Ref } from 'vue';
import type { Widget } from '../types';
import type { Settings } from '../types';
import { clampAllWidgetsInPlace } from './widgetCanvasBounds';

export function useWidgets(settings: Ref<Settings>) {
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

    const clampAllWidgets = () => {
        const cw = settings.value.canvasWidth;
        const ch = settings.value.canvasHeight;
        clampAllWidgetsInPlace(widgets.value, cw, ch);
    };

    watch(
        () => [settings.value.canvasWidth, settings.value.canvasHeight] as const,
        () => {
            clampAllWidgets();
        },
    );

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

    // 统一建立一个新 widget 的默认字段（不 push 进列表，方便组合使用）
    const buildWidget = (
        type: string,
        opts: Partial<Widget> = {},
    ): Widget => {
        const id = nextId.value++;
        const cw = settings.value.canvasWidth;
        const ch = settings.value.canvasHeight;
        const ww = opts.w ?? 100;
        const hh = opts.h ?? 100;
        const cx = opts.x ?? Math.max(0, Math.floor((cw - ww) / 2));
        const cy = opts.y ?? Math.max(0, Math.floor((ch - hh) / 2));
        let defaultText = '';
        if (type === 'text') defaultText = '文本';
        else if (type === 'button') defaultText = '按钮';
        const w: Widget = {
            id,
            name: opts.name ?? `${type}_${id}`,
            type,
            parentId: opts.parentId ?? null,
            x: cx,
            y: cy,
            w: ww,
            h: hh,
            enable: opts.enable ?? true,
            visible: opts.visible ?? true,
            locked: opts.locked ?? false,
            font: opts.font ?? '',
            fontSize: opts.fontSize ?? 14,
            outlineSize: opts.outlineSize ?? 0,
            textAlignH: opts.textAlignH ?? 'left',
            textAlignV: opts.textAlignV ?? 'top',
            text: opts.text ?? defaultText,
            image: opts.image ?? '',
            clickImage: opts.clickImage ?? '',
            hoverImage: opts.hoverImage ?? '',
            draggable: opts.draggable ?? false,
            checked: opts.checked ?? false,
            selectedIndex: opts.selectedIndex ?? 0,
        };
        // 允许通过 opts 透传新字段（alpha/padding/tooltip/fdfTemplate/...）
        return Object.assign(w, opts, {
            id, // 强制使用生成的 id
            type,
            x: cx,
            y: cy,
            w: ww,
            h: hh,
            name: w.name,
        });
    };

    const addWidget = (type: string) => {
        // Dialog 是组合控件：一次性创建 Panel(titleBar) + 若干 Button
        if (type === 'dialog') {
            const panel = buildWidget('panel', {
                w: 320,
                h: 220,
                templateKind: 'Dialog',
                showTitleBar: true,
                titleBarHeight: 28,
                title: '对话框',
                titleColor: 'FFCC00',
                showCloseButton: true,
                backgroundPreset: 'DIALOG',
            });
            widgets.value.push(panel);
            // 标题文字（子 Text 节点）
            const titleText = buildWidget('text', {
                parentId: panel.id,
                x: panel.x + 12,
                y: panel.y + 6,
                w: panel.w - 24,
                h: 20,
                text: panel.title || '对话框',
                textAlignH: 'center',
                textAlignV: 'middle',
                fontSize: 16,
                textColor: 'FFCC00',
                name: `${panel.name}_title`,
            });
            widgets.value.push(titleText);
            // 默认两个按钮：确定 / 取消
            const btnW = 88;
            const btnH = 28;
            const gap = 16;
            const totalW = btnW * 2 + gap;
            const startX = panel.x + Math.floor((panel.w - totalW) / 2);
            const btnY = panel.y + panel.h - btnH - 16;
            const mkBtn = (text: string, idx: number) => {
                const btn = buildWidget('button', {
                    parentId: panel.id,
                    x: startX + idx * (btnW + gap),
                    y: btnY,
                    w: btnW,
                    h: btnH,
                    text,
                    fdfTemplate: 'NORMAL_DIALOG',
                    name: `${panel.name}_btn_${idx + 1}`,
                });
                widgets.value.push(btn);
                // 给按钮补一个 Text 子节点
                const label = buildWidget('text', {
                    parentId: btn.id,
                    x: btn.x,
                    y: btn.y,
                    w: btn.w,
                    h: btn.h,
                    text,
                    textAlignH: 'center',
                    textAlignV: 'middle',
                    fontSize: 14,
                    textColor: 'FFFFFF',
                    name: `${btn.name}_label`,
                });
                widgets.value.push(label);
            };
            mkBtn('确定', 0);
            mkBtn('取消', 1);
            selectedIds.value = [panel.id];
            clampAllWidgets();
            return;
        }

        const w = buildWidget(type);
        widgets.value.push(w);

        // Button 组合：自动补一个 Text 子节点作为文字层（与模板 Button.ts 一致）
        if (type === 'button') {
            const label = buildWidget('text', {
                parentId: w.id,
                x: w.x,
                y: w.y,
                w: w.w,
                h: w.h,
                text: w.text,
                textAlignH: 'center',
                textAlignV: 'middle',
                fontSize: 14,
                textColor: 'FFFFFF',
                name: `${w.name}_label`,
            });
            widgets.value.push(label);
        }

        selectedIds.value = [w.id];
        clampAllWidgets();
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
        clampAllWidgets();
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
        clampAllWidgets,
        clearAll,
        deleteSelected,
    };
}

