<template>
    <Teleport to="body">
        <div v-if="proposals.length > 0" class="proposal-stack">
            <div v-for="p in proposals" :key="p.id" class="proposal-card">
                <div class="proposal-header">
                    <span class="proposal-title">AI 提案：{{ p.title || '变更待确认' }}</span>
                    <span class="proposal-session">session: {{ shortId(p.sessionId) }}</span>
                </div>
                <div class="proposal-summary">
                    <span v-if="p.summary.created">新增 {{ p.summary.created }}</span>
                    <span v-if="p.summary.updated">修改 {{ p.summary.updated }}</span>
                    <span v-if="p.summary.deleted">删除 {{ p.summary.deleted }}</span>
                    <span v-if="p.summary.moved">重挂 {{ p.summary.moved }}</span>
                    <span v-if="p.summary.selected">选中 {{ p.summary.selected }}</span>
                    <span v-if="p.summary.unknown">未知 {{ p.summary.unknown }}</span>
                    <span class="proposal-total">共 {{ p.summary.total }} 项</span>
                </div>
                <div v-if="p.reason" class="proposal-reason">
                    <span class="proposal-reason-label">AI 理由：</span>{{ p.reason }}
                </div>
                <details class="proposal-details">
                    <summary>查看动作列表</summary>
                    <pre class="proposal-raw selectable">{{ formatActions(p.actions) }}</pre>
                </details>
                <div class="proposal-actions">
                    <v-btn color="success" size="small" variant="flat" @click="onAccept(p.id)">
                        Accept
                    </v-btn>
                    <v-btn color="error" size="small" variant="tonal" @click="onReject(p.id)">
                        Reject
                    </v-btn>
                </div>
            </div>
        </div>
    </Teleport>
</template>

<script setup lang="ts">
import type { PropType } from 'vue';
import type { PendingProposal } from '../composables/useProposals';

defineProps({
    proposals: {
        type: Array as PropType<PendingProposal[]>,
        default: () => [],
    },
});

const emit = defineEmits<{
    (e: 'accept', id: string): void;
    (e: 'reject', id: string): void;
}>();

const onAccept = (id: string) => emit('accept', id);
const onReject = (id: string) => emit('reject', id);

const shortId = (id: string) => (id?.length > 12 ? `${id.slice(0, 10)}…` : id);

const formatActions = (actions: unknown[]) => JSON.stringify(actions, null, 2);
</script>

<style scoped>
.proposal-stack {
    position: fixed;
    right: 16px;
    bottom: 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    z-index: 9999;
    max-width: 420px;
    pointer-events: none;
}

.proposal-card {
    pointer-events: auto;
    background: #1f2430;
    border: 1px solid #3e4a63;
    border-radius: 10px;
    padding: 12px 14px;
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.4);
    color: #d7dae0;
    font-size: 12px;
}

.proposal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
}

.proposal-title {
    font-weight: 600;
    color: #ffd166;
}

.proposal-session {
    font-family: monospace;
    font-size: 10px;
    color: #7a8597;
}

.proposal-summary {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-bottom: 6px;
}

.proposal-summary span {
    padding: 2px 8px;
    background: rgba(82, 183, 255, 0.12);
    border-radius: 10px;
}

.proposal-total {
    color: #9aa4b7;
    background: transparent !important;
}

.proposal-reason {
    margin-bottom: 6px;
    color: #cfd4de;
}

.proposal-reason-label {
    color: #9aa4b7;
}

.proposal-details {
    margin: 6px 0 8px;
}

.proposal-details summary {
    cursor: pointer;
    color: #9aa4b7;
    font-size: 11px;
}

.proposal-raw {
    margin-top: 6px;
    max-height: 180px;
    overflow: auto;
    background: #141821;
    border: 1px solid #2a3142;
    padding: 8px;
    border-radius: 6px;
    font-size: 11px;
}

.proposal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
}
</style>
