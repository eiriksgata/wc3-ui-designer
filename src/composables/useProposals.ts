import { computed, ref } from 'vue';
import type { DesignerAction } from '../types/actionApi';

/**
 * Proposal-Confirmation Gateway（Phase 4）
 *
 * 设计要点：
 *  - 不改 Rust 侧协议：AI 通过 `ui_runtime_call(method="proposeActions", params={...})`
 *    把一批动作挂成“提案”，由设计器的前端侧进行显式 Accept/Reject。
 *  - 完全异步：每个提案返回一个 Promise，让调用方（AI）能够拿到最终结果。
 *  - `sessionId` 贯穿始终：Accept 时复用同一个 `sessionId` 调 `batchApply`，
 *    可与 `ui_apply_actions` 的审计链路对齐。
 */

export interface ProposalRequest {
    actions: DesignerAction[];
    sessionId?: string;
    reason?: string;
    /** 用于人类可读的标题，例如 "添加主菜单面板" */
    title?: string;
}

export interface ProposalSummary {
    created: number;
    updated: number;
    deleted: number;
    moved: number;
    selected: number;
    unknown: number;
    total: number;
}

export interface ProposalDecisionPayload {
    ok: boolean;
    status: 'accepted' | 'rejected';
    applied?: number;
    errors?: string[];
    sessionId: string;
    proposalId: string;
}

export interface PendingProposal {
    id: string;
    createdAt: number;
    sessionId: string;
    reason?: string;
    title?: string;
    actions: DesignerAction[];
    summary: ProposalSummary;
}

type PendingEntry = PendingProposal & {
    resolve: (r: ProposalDecisionPayload) => void;
};

function summarize(actions: DesignerAction[]): ProposalSummary {
    const s: ProposalSummary = {
        created: 0,
        updated: 0,
        deleted: 0,
        moved: 0,
        selected: 0,
        unknown: 0,
        total: actions.length,
    };
    for (const a of actions) {
        switch ((a as { type?: string })?.type) {
            case 'createWidget':
                s.created++;
                break;
            case 'updateWidgetProps':
                s.updated++;
                break;
            case 'deleteWidget':
                s.deleted++;
                break;
            case 'setParent':
                s.moved++;
                break;
            case 'selectWidgets':
                s.selected++;
                break;
            default:
                s.unknown++;
        }
    }
    return s;
}

function makeId(): string {
    return `proposal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function useProposals(
    batchApply: (actions: DesignerAction[]) => { ok: boolean; applied: number; errors: string[] },
) {
    const pending = ref<PendingEntry[]>([]);

    /**
     * AI 端通过 `ui_runtime_call(method="proposeActions", params=...)` 进来。
     * 返回的 Promise 在用户 Accept/Reject 后 resolve。
     */
    const propose = (req: ProposalRequest): Promise<ProposalDecisionPayload> => {
        return new Promise((resolve) => {
            const id = makeId();
            const sessionId =
                req.sessionId && req.sessionId.trim()
                    ? req.sessionId
                    : `session-${Date.now()}`;
            const entry: PendingEntry = {
                id,
                createdAt: Date.now(),
                sessionId,
                reason: req.reason,
                title: req.title,
                actions: [...(req.actions || [])],
                summary: summarize(req.actions || []),
                resolve,
            };
            pending.value = [...pending.value, entry];
        });
    };

    const accept = (id: string): ProposalDecisionPayload | null => {
        const idx = pending.value.findIndex((p) => p.id === id);
        if (idx < 0) return null;
        const entry = pending.value[idx];
        const result = batchApply(entry.actions);
        const decision: ProposalDecisionPayload = {
            ok: result.ok,
            status: 'accepted',
            applied: result.applied,
            errors: result.errors,
            sessionId: entry.sessionId,
            proposalId: entry.id,
        };
        entry.resolve(decision);
        pending.value = pending.value.filter((p) => p.id !== id);
        return decision;
    };

    const reject = (id: string, reason?: string): ProposalDecisionPayload | null => {
        const idx = pending.value.findIndex((p) => p.id === id);
        if (idx < 0) return null;
        const entry = pending.value[idx];
        const decision: ProposalDecisionPayload = {
            ok: true,
            status: 'rejected',
            sessionId: entry.sessionId,
            proposalId: entry.id,
            errors: reason ? [reason] : [],
        };
        entry.resolve(decision);
        pending.value = pending.value.filter((p) => p.id !== id);
        return decision;
    };

    const hasPending = computed(() => pending.value.length > 0);
    const list = computed<PendingProposal[]>(() =>
        pending.value.map(({ resolve: _resolve, ...rest }) => rest),
    );

    return {
        propose,
        accept,
        reject,
        hasPending,
        list,
    };
}
