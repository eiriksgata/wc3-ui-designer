<template>
    <div v-if="show" class="export-overlay" @click.self="emitClose">
        <div class="export-dialog plugin-debug-dialog">
            <h3>插件调试输出</h3>
            <div class="export-body">
                <div class="export-section">
                    <pre class="plugin-debug-output">{{ output }}</pre>
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
    output: { type: String, default: '' },
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

.plugin-debug-dialog {
    max-width: 800px;
    width: 90vw;
}

.export-body {
    max-height: 60vh;
    overflow-y: auto;
}

.export-section {
    margin-bottom: 20px;
    padding-bottom: 16px;
    border-bottom: 1px solid #3e3e42;
}

.export-footer {
    margin-top: 16px;
    display: flex;
    justify-content: flex-end;
    gap: 10px;
}

.plugin-debug-output {
    width: 100%;
    min-height: 200px;
    max-height: 500px;
    padding: 12px;
    background: #1e1e1e;
    border: 1px solid #3e3e42;
    border-radius: 4px;
    color: #d4d4d4;
    font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
    font-size: 12px;
    line-height: 1.5;
    overflow: auto;
    white-space: pre-wrap;
    word-wrap: break-word;
}
</style>

