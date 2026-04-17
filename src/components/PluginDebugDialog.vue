<template>
    <v-dialog
        :model-value="show"
        width="900"
        scrim="rgba(9, 11, 15, 0.72)"
        @update:model-value="onDialogModelUpdate"
    >
        <v-card class="plugin-debug-dialog" rounded="xl" elevation="12">
            <v-card-title>插件调试输出</v-card-title>
            <v-card-text class="export-body">
                <pre class="plugin-debug-output">{{ output }}</pre>
            </v-card-text>
            <v-card-actions class="export-footer">
                <v-btn variant="flat" color="primary" @click="emitClose">关闭</v-btn>
            </v-card-actions>
        </v-card>
    </v-dialog>
</template>

<script setup lang="ts">
const props = defineProps({
    show: { type: Boolean, default: false },
    output: { type: String, default: '' },
});

const emit = defineEmits(['close']);
const emitClose = () => emit('close');
const onDialogModelUpdate = (value: boolean) => {
    if (!value) emitClose();
};
</script>

<style scoped>
.plugin-debug-dialog {
    background: #2d2d30;
    border: 1px solid #3e3e42;
    max-width: 800px;
    width: 90vw;
}

.export-body {
    max-height: 60vh;
    overflow-y: auto;
}

.export-footer {
    display: flex;
    justify-content: flex-end;
    padding: 10px 16px 16px;
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

