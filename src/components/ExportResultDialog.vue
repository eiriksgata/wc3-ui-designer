<template>
    <v-dialog
        :model-value="show"
        width="620"
        scrim="rgba(9, 11, 15, 0.72)"
        @update:model-value="onDialogModelUpdate"
    >
        <v-card class="export-result-card" rounded="xl" elevation="12">
            <v-card-title>导出结果</v-card-title>
            <v-card-text class="export-result-body">
                <div v-if="messages.length === 0" class="export-result-item">
                    <span class="export-result-text">导出完成，但没有详细信息。</span>
                </div>
                <div v-for="(msg, index) in messages" :key="index" class="export-result-item">
                    <span class="export-result-text">{{ msg }}</span>
                </div>
            </v-card-text>
            <v-card-actions class="export-footer">
                <v-btn variant="flat" color="primary" @click="emitClose">关闭</v-btn>
            </v-card-actions>
        </v-card>
    </v-dialog>
</template>

<script setup lang="ts">
import type { PropType } from 'vue';

const props = defineProps({
    show: { type: Boolean, default: false },
    messages: { type: Array as PropType<string[]>, default: () => [] },
});

const emit = defineEmits(['close']);
const emitClose = () => emit('close');
const onDialogModelUpdate = (value: boolean) => {
    if (!value) emitClose();
};
</script>

<style scoped>
.export-result-card {
    background: #2d2d30;
    border: 1px solid #3e3e42;
    max-height: 70vh;
}

.export-result-body {
    max-height: 400px;
    overflow-y: auto;
    padding: 8px 0;
}

.export-result-item {
    padding: 8px 12px;
    margin-bottom: 8px;
    background: #252526;
    border-left: 3px solid #4fc3f7;
    border-radius: 4px;
    word-break: break-word;
}

.export-result-item:last-child {
    margin-bottom: 0;
}

.export-result-text {
    color: #ccc;
    font-size: 13px;
    line-height: 1.5;
}

.export-footer {
    display: flex;
    justify-content: flex-end;
    padding: 10px 16px 16px;
}
</style>
