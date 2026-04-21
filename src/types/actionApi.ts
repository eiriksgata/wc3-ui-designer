import type { Animation, Settings, Widget } from './index';

export type ActionType =
    | 'createWidget'
    | 'updateWidgetProps'
    | 'deleteWidget'
    | 'setParent'
    | 'selectWidgets';

export interface ActionBase {
    idempotencyKey?: string;
    type: ActionType;
}

export interface CreateWidgetAction extends ActionBase {
    type: 'createWidget';
    payload: {
        widgetType: string;
        overrides?: Partial<Widget>;
    };
}

export interface UpdateWidgetPropsAction extends ActionBase {
    type: 'updateWidgetProps';
    targetId: number;
    payload: Partial<Widget>;
}

export interface DeleteWidgetAction extends ActionBase {
    type: 'deleteWidget';
    targetId: number;
}

export interface SetParentAction extends ActionBase {
    type: 'setParent';
    targetId: number;
    payload: {
        parentId: number | null;
    };
}

export interface SelectWidgetsAction extends ActionBase {
    type: 'selectWidgets';
    payload: {
        ids: number[];
    };
}

export type DesignerAction =
    | CreateWidgetAction
    | UpdateWidgetPropsAction
    | DeleteWidgetAction
    | SetParentAction
    | SelectWidgetsAction;

export interface DesignerSnapshot {
    widgets: Widget[];
    animations: Animation[];
    settings: Settings;
}

export interface ActionResult {
    ok: boolean;
    applied: number;
    errors: string[];
}
