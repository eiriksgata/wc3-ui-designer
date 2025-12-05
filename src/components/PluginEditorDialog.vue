<template>
    <div v-if="show" class="export-overlay" @click.self="emitClose">
        <div class="export-dialog plugin-editor-dialog">
            <h3>插件编辑器</h3>
            <div class="export-body">
                <div class="export-section">
                    <label for="plugin-editor-name">插件名称：</label>
                    <input id="plugin-editor-name" type="text" v-model="nameModel" class="plugin-editor-name-input"
                        placeholder="输入插件名称" />
                </div>
                <div class="export-section">
                    <label for="plugin-editor-content">插件代码（TypeScript）：</label>
                    <textarea id="plugin-editor-content" v-model="contentModel" class="plugin-editor-textarea"
                        placeholder="输入 TypeScript 插件代码..."></textarea>
                    <div class="plugin-editor-hint">
                        <p>提示：</p>
                        <ul>
                            <li>插件必须导出 <code>metadata</code> 对象和 <code>export</code> 函数</li>
                            <li><code>export</code> 函数接收 <code>ExportContext</code> 参数，返回生成的代码字符串</li>
                            <li>查看示例插件了解详细用法</li>
                        </ul>
                    </div>
                </div>
            </div>
            <div class="export-footer">
                <button v-if="path" @click="emitOpenDefaultEditor" class="btn-open-editor">用默认编辑器打开</button>
                <button @click="emitClose">取消</button>
                <button @click="emitSave">保存</button>
            </div>
        </div>
    </div>
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

.plugin-editor-dialog {
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

.plugin-editor-name-input {
    width: 100%;
    padding: 6px 10px;
    background: #1e1e1e;
    border: 1px solid #3e3e42;
    border-radius: 4px;
    color: #ccc;
    font-size: 13px;
}

.plugin-editor-name-input:focus {
    outline: none;
    border-color: #4fc3f7;
}

.plugin-editor-textarea {
    width: 100%;
    min-height: 300px;
    padding: 8px;
    background: #1e1e1e;
    border: 1px solid #3e3e42;
    border-radius: 4px;
    color: #ccc;
    font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
    font-size: 13px;
    line-height: 1.5;
    resize: vertical;
}

.plugin-editor-textarea:focus {
    outline: none;
    border-color: #4fc3f7;
}

.export-footer {
    margin-top: 16px;
    display: flex;
    justify-content: flex-end;
    gap: 10px;
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
