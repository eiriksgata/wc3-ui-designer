<template>
    <v-dialog
        :model-value="show"
        width="980"
        scrim="rgba(9, 11, 15, 0.72)"
        @update:model-value="onDialogModelUpdate"
    >
        <v-card class="plugin-editor-dialog" rounded="xl" elevation="12">
            <v-card-title>插件编辑器</v-card-title>
            <v-card-text class="export-body">
                <div class="export-section">
                    <label for="plugin-editor-name">插件名称：</label>
                    <v-text-field
                        id="plugin-editor-name"
                        v-model="nameModel"
                        density="compact"
                        variant="outlined"
                        hide-details
                        placeholder="输入插件名称"
                    />
                </div>
                <div class="export-section">
                    <label for="plugin-editor-content">插件代码（TypeScript）：</label>
                    <v-textarea
                        id="plugin-editor-content"
                        v-model="contentModel"
                        class="plugin-editor-textarea"
                        variant="outlined"
                        auto-grow
                        rows="12"
                        hide-details
                        placeholder="输入 TypeScript 插件代码..."
                    />
                    <div class="plugin-editor-hint">
                        <p>提示：</p>
                        <ul>
                            <li>插件必须导出 <code>metadata</code> 对象和 <code>export</code> 函数</li>
                            <li><code>export</code> 函数接收 <code>ExportContext</code> 参数，返回生成的代码字符串</li>
                            <li>查看示例插件了解详细用法</li>
                        </ul>
                    </div>
                </div>
            </v-card-text>
            <v-card-actions class="export-footer">
                <v-btn v-if="path" @click="emitOpenDefaultEditor" class="btn-open-editor" variant="text" color="secondary">
                    用默认编辑器打开
                </v-btn>
                <v-btn @click="emitClose" variant="text" color="secondary">取消</v-btn>
                <v-btn @click="emitSave" variant="flat" color="primary">保存</v-btn>
            </v-card-actions>
        </v-card>
    </v-dialog>
</template>

<script setup lang="ts">
const props = defineProps({
    show: { type: Boolean, default: false },
    path: { type: String, default: '' },
});

const nameModel = defineModel('name', { type: String, default: '' });
const contentModel = defineModel('content', { type: String, default: '' });

const emit = defineEmits(['close', 'save', 'open-default-editor']);

const emitClose = () => emit('close');
const emitSave = () => emit('save');
const emitOpenDefaultEditor = () => emit('open-default-editor');
const onDialogModelUpdate = (value: boolean) => {
    if (!value) emitClose();
};
</script>

<style scoped>
.plugin-editor-dialog {
    background: #2d2d30;
    border: 1px solid #3e3e42;
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

.export-body label {
    display: block;
    margin: 6px 0 4px;
    font-size: 12px;
    color: #ccc;
}

.export-footer {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    padding: 10px 16px 16px;
}

.btn-open-editor {
    margin-right: auto;
    background: #2d2d30;
    color: #ccc;
}

.btn-open-editor:hover {
    background: #3a3a3d;
}

.plugin-editor-hint {
    margin-top: 12px;
    padding: 10px;
    background: #1a1a1a;
    border: 1px solid #3e3e42;
    border-radius: 4px;
    font-size: 11px;
    color: #aaa;
}

.plugin-editor-hint p {
    margin: 0 0 6px 0;
    color: #ccc;
    font-weight: 500;
}

.plugin-editor-hint ul {
    margin: 0;
    padding-left: 20px;
}

.plugin-editor-hint li {
    margin: 4px 0;
    line-height: 1.4;
}

.plugin-editor-hint code {
    background: #2d2d30;
    padding: 2px 4px;
    border-radius: 3px;
    font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
    color: #4ec9b0;
}
</style>
