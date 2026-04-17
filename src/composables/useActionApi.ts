import type { Ref } from 'vue';
import type { Widget, ImageResource, Animation, Settings } from '../types';
import type { ExportPlugin } from '../types/plugin';
import type { ActionResult, DesignerAction, DesignerSnapshot } from '../types/actionApi';

interface ActionApiDeps {
    widgetsList: Ref<Widget[]>;
    selectedIds: Ref<number[]>;
    imageResources: Ref<ImageResource[]>;
    animations: Ref<Animation[]>;
    settings: Ref<Settings>;
    nextId: Ref<number>;
    addWidgetWithHistory: (type: string) => void;
    deleteSelectedWithHistory: () => void;
    pushHistory: () => void;
    undoLayout: () => void;
    redoLayout: () => void;
    doExport: () => Promise<void>;
    exportResultMessages: Ref<string[]>;
    selectedExportPlugin: Ref<string>;
    exportPlugins: Ref<ExportPlugin[]>;
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

export function useActionApi(deps: ActionApiDeps) {
    const getProjectSnapshot = (): DesignerSnapshot => ({
        widgets: clone(deps.widgetsList.value),
        resources: clone(deps.imageResources.value),
        animations: clone(deps.animations.value),
        settings: clone(deps.settings.value),
    });

    const replaceProjectSnapshot = (snapshot: DesignerSnapshot) => {
        deps.widgetsList.value = clone(snapshot.widgets || []);
        deps.imageResources.value = clone(snapshot.resources || []);
        deps.animations.value = clone(snapshot.animations || []);
        deps.settings.value = clone(snapshot.settings || deps.settings.value);
        const maxId = deps.widgetsList.value.reduce((max, widget) => Math.max(max, widget.id || 0), 0);
        deps.nextId.value = maxId + 1;
    };

    const listWidgets = (): Widget[] => clone(deps.widgetsList.value);

    const findWidget = (id: number): Widget | undefined =>
        deps.widgetsList.value.find((widget) => widget.id === id);

    const applyAction = (action: DesignerAction): string | null => {
        if (action.type === 'createWidget') {
            deps.addWidgetWithHistory(action.payload.widgetType);
            const created = deps.widgetsList.value[deps.widgetsList.value.length - 1];
            if (created && action.payload.overrides) {
                Object.assign(created, action.payload.overrides);
            }
            return null;
        }

        if (action.type === 'updateWidgetProps') {
            const target = findWidget(action.targetId);
            if (!target) return `控件不存在: ${action.targetId}`;
            deps.pushHistory();
            Object.assign(target, action.payload);
            return null;
        }

        if (action.type === 'setParent') {
            const target = findWidget(action.targetId);
            if (!target) return `控件不存在: ${action.targetId}`;
            deps.pushHistory();
            target.parentId = action.payload.parentId;
            return null;
        }

        if (action.type === 'deleteWidget') {
            deps.selectedIds.value = [action.targetId];
            deps.deleteSelectedWithHistory();
            return null;
        }

        if (action.type === 'selectWidgets') {
            deps.selectedIds.value = [...action.payload.ids];
            return null;
        }

        return `不支持的动作类型: ${(action as { type?: string }).type || 'unknown'}`;
    };

    const batchApply = (actions: DesignerAction[]): ActionResult => {
        const errors: string[] = [];
        let applied = 0;

        actions.forEach((action) => {
            const error = applyAction(action);
            if (error) {
                errors.push(error);
                return;
            }
            applied += 1;
        });

        return {
            ok: errors.length === 0,
            applied,
            errors,
        };
    };

    const validate = () => {
        const diagnostics: string[] = [];
        const byParent = new Map<string, Set<string>>();

        deps.widgetsList.value.forEach((widget) => {
            const parentKey = widget.parentId == null ? '__root__' : String(widget.parentId);
            const names = byParent.get(parentKey) || new Set<string>();
            const name = (widget.name || '').trim();
            if (name) {
                if (names.has(name)) diagnostics.push(`同级重名: ${name}`);
                names.add(name);
            }
            byParent.set(parentKey, names);
        });

        return {
            ok: diagnostics.length === 0,
            diagnostics,
        };
    };

    const exportWithPlugin = async (pluginId: string) => {
        deps.selectedExportPlugin.value = pluginId;
        await deps.doExport();
        return {
            pluginId,
            messages: [...deps.exportResultMessages.value],
        };
    };

    const exportStructuredJson = async () => exportWithPlugin('json-structured-export');
    const undo = () => deps.undoLayout();
    const redo = () => deps.redoLayout();

    const listExportPlugins = () =>
        deps.exportPlugins.value.map((plugin) => ({
            id: plugin.id,
            name: plugin.name,
            outputFormat: plugin.outputFormat,
            type: plugin.type,
        }));

    return {
        getProjectSnapshot,
        replaceProjectSnapshot,
        listWidgets,
        batchApply,
        validate,
        exportWithPlugin,
        exportStructuredJson,
        undo,
        redo,
        listExportPlugins,
    };
}
