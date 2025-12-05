<template>
    <div v-if="show" class="export-overlay" @click.self="emitClose">
        <div class="export-dialog export-result-dialog">
            <h3>导出结果</h3>
            <div class="export-result-body">
                <div v-if="messages.length === 0" class="export-result-item">
                    <span class="export-result-text">导出完成，但没有详细信息。</span>
                </div>
                <div v-for="(msg, index) in messages" :key="index" class="export-result-item">
                    <span class="export-result-text">{{ msg }}</span>
                </div>
            </div>
            <div class="export-footer">
                <button @click="emitClose">关闭</button>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
const props = defineProps({
    show: { type: Boolean, default: false },
    messages: { type: Array, default: () => [] },
});

const emit = defineEmits(['close']);
const emitClose = () => emit('close');
</script>

<style scoped>
.export-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1500;
}

.export-dialog {
    background: #2d2d30;
    border: 1px solid #3e3e42;
    border-radius: 8px;
    width: 420px;
    max-width: 90vw;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
    padding: 16px 20px;
}

.export-result-dialog {
    max-height: 70vh;
    overflow-y: auto;
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
    margin-top: 16px;
    display: flex;
    justify-content: flex-end;
    gap: 10px;
}
</style>
