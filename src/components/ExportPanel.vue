<template>
    <div v-if="show" class="export-overlay" @click.self="emitClose">
        <div class="export-dialog export-dialog-large" :style="dialogStyle" @mousedown.stop>
            <h3 class="export-header" @mousedown.prevent="onDragStart">导出选项</h3>
            <div class="export-body" @click="showPluginDropdown = false">
                <!-- 导出资源：勾选 + 路径整行在一行 -->
                <div class="export-section">
                    <div class="export-line">
                        <label class="export-option">
                            <input type="checkbox" v-model="exportResourcesEnabledModel" />
                            <strong>导出资源</strong>
                        </label>
                        <div v-if="exportResourcesEnabledModel" class="export-path-inline">
                            <span class="export-path-inline-label">资源导出路径：</span>
                            <div class="export-path-input">
                                <input id="export-resources-path" type="text" v-model="exportResourcesPathModel"
                                    placeholder="选择资源导出目录..." readonly />
                                <button @click.stop="emitSelectExportResourcesPath"
                                    class="btn-select-path">选择路径</button>
                            </div>
                        </div>
                    </div>

                    <!-- 导出 Lua：勾选 + 路径整行在一行 -->
                    <div class="export-line">
                        <label class="export-option">
                            <input type="checkbox" v-model="exportLuaEnabledModel" />
                            <strong>导出 Lua</strong>
                        </label>
                        <div v-if="exportLuaEnabledModel" class="export-path-inline">
                            <span class="export-path-inline-label">Lua 导出路径：</span>
                            <div class="export-path-input">
                                <input id="export-lua-path" type="text" v-model="exportLuaPathModel"
                                    placeholder="选择 Lua 文件保存位置..." readonly />
                                <button @click.stop="emitSelectExportLuaPath" class="btn-select-path">选择路径</button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 导出插件选择（放在导出 Lua 下方） -->
                <div class="export-section">
                    <label for="export-plugin-select" style="display: block; margin-bottom: 8px;">选择导出插件：</label>
                    <div class="export-plugin-select-group">
                        <div class="custom-select-wrapper" @click.stop>
                            <button type="button" class="custom-select-button"
                                @click.stop="showPluginDropdown = !showPluginDropdown">
                                {{ currentPluginName }}
                                {{ currentPluginIsBuiltin ? ' (内置)' : '' }}
                                <span class="custom-select-arrow">▼</span>
                            </button>
                            <div v-if="showPluginDropdown" class="custom-select-dropdown" @click.stop>
                                <div v-for="plugin in exportPlugins" :key="plugin.id" class="custom-select-option"
                                    :class="{ 'selected': plugin.id === selectedExportPluginModel }"
                                    @click.stop="selectPlugin(plugin.id)">
                                    <span class="plugin-name">
                                        {{ plugin.name }}{{ plugin.type === 'builtin' ? ' (内置)' : '' }}
                                    </span>
                                    <button v-if="plugin.type !== 'builtin' && plugin.id !== 'default'"
                                        class="plugin-delete-btn" @click.stop="emitDeletePlugin(plugin.id)"
                                        title="删除插件">
                                        ×
                                    </button>
                                </div>
                            </div>
                        </div>
                        <button @click="emitLoadCustomPlugin" class="btn-select-path">加载插件</button>
                        <button @click="emitCreateNewPlugin" class="btn-select-path">新建插件</button>
                        <button v-if="selectedExportPluginModel !== 'default'" @click="emitEditPlugin"
                            class="btn-select-path">
                            编辑
                        </button>
                    </div>
                </div>

                <div class="hint">至少选择一项导出选项。</div>
            </div>
            <div class="export-footer">
                <button @click="emitClose">取消</button>
                <button @click="emitDoExport" :disabled="!exportResourcesEnabledModel && !exportLuaEnabledModel">
                    导出
                </button>
            </div>
        </div>
    </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';

const props = defineProps({
    show: { type: Boolean, default: false },
    exportPlugins: { type: Array, default: () => [] },
    // 当前 UI 缩放，用于修正拖动偏移（缩放后屏幕像素与逻辑坐标不一致）
    uiZoom: { type: Number, default: 1 },
});

const exportResourcesEnabledModel = defineModel('exportResourcesEnabled', { type: Boolean, default: false });
const exportResourcesPathModel = defineModel('exportResourcesPath', { type: String, default: '' });
const exportLuaEnabledModel = defineModel('exportLuaEnabled', { type: Boolean, default: false });
const exportLuaPathModel = defineModel('exportLuaPath', { type: String, default: '' });
const selectedExportPluginModel = defineModel('selectedExportPlugin', { type: String, default: 'default' });

const emit = defineEmits([
    'close',
    'select-export-resources-path',
    'select-export-lua-path',
    'load-custom-plugin',
    'create-new-plugin',
    'edit-plugin',
    'delete-plugin',
    'do-export',
]);

const showPluginDropdown = ref(false);

const currentPlugin = computed(() =>
    props.exportPlugins.find((p) => p.id === selectedExportPluginModel.value),
);
const currentPluginName = computed(() => currentPlugin.value?.name || '选择插件');
const currentPluginIsBuiltin = computed(() => currentPlugin.value?.type === 'builtin');

const emitClose = () => emit('close');
const emitSelectExportResourcesPath = () => emit('select-export-resources-path');
const emitSelectExportLuaPath = () => emit('select-export-lua-path');
const emitLoadCustomPlugin = () => emit('load-custom-plugin');
const emitCreateNewPlugin = () => emit('create-new-plugin');
const emitEditPlugin = () => emit('edit-plugin');
const emitDeletePlugin = (id) => emit('delete-plugin', id);
const emitDoExport = () => emit('do-export');

const selectPlugin = (pluginId) => {
    selectedExportPluginModel.value = pluginId;
    showPluginDropdown.value = false;
};

// --- 拖动逻辑 ---
const dragOffsetX = ref(0);
const dragOffsetY = ref(0);
const dragging = ref(false);
// 上一帧鼠标位置，用增量来更新偏移，避免初始偏移感不对
let lastClientX = 0;
let lastClientY = 0;

const dialogStyle = computed(() => ({
    transform: `translate(${dragOffsetX.value}px, ${dragOffsetY.value}px)`,
}));

const onDragMove = (ev) => {
    if (!dragging.value) return;
    const dx = ev.clientX - lastClientX;
    const dy = ev.clientY - lastClientY;
    const scale = props.uiZoom || 1;
    // 屏幕像素位移换算到缩放前的逻辑坐标，避免缩放导致“拖一点跑很多”
    dragOffsetX.value += dx / scale;
    dragOffsetY.value += dy / scale;
    lastClientX = ev.clientX;
    lastClientY = ev.clientY;
};

const onDragEnd = () => {
    dragging.value = false;
    window.removeEventListener('mousemove', onDragMove);
    window.removeEventListener('mouseup', onDragEnd);
};

const onDragStart = (ev) => {
    dragging.value = true;
    lastClientX = ev.clientX;
    lastClientY = ev.clientY;
    window.addEventListener('mousemove', onDragMove);
    window.addEventListener('mouseup', onDragEnd);
};

// 打开面板时重置位置
watch(
    () => props.show,
    (v) => {
        if (v) {
            dragOffsetX.value = 0;
            dragOffsetY.value = 0;
        }
    },
);
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
    padding: 16px 16px;
    /* 稍微缩小左右留白，给内容更多宽度 */
    user-select: none;
    /* 禁止整体文本选中，避免误拖蓝复制 */
}

.export-dialog-large {
    width: 720px;
    /* 整体对话框加宽，让路径输入框真正变长 */
    max-width: 90vw;
}

.export-dialog h3 {
    margin: 0 0 16px 0;
    font-size: 16px;
    color: #ccc;
}

.export-header {
    cursor: move;
    user-select: none;
}

.export-body {
    /* 取消内部滚动，避免插件下拉框被裁剪 */
    max-height: none;
    overflow: visible;
}

.export-section {
    margin-bottom: 20px;
    padding-bottom: 16px;
    border-bottom: 1px solid #3e3e42;
}

.export-line {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 6px;
}

.export-section:last-child {
    border-bottom: none;
    margin-bottom: 0;
    padding-bottom: 0;
}

.export-body label {
    display: block;
    margin: 6px 0 4px;
    font-size: 12px;
    color: #ccc;
}

.export-body input[type='text'] {
    width: 100%;
    padding: 6px 8px;
    background: #1a1a1a;
    border: 1px solid #3e3e42;
    color: #ccc;
    border-radius: 4px;
    box-sizing: border-box;
}

/* 表单控件内仍然允许正常选中和复制 */
.export-dialog input,
.export-dialog button,
.export-dialog select,
.export-dialog textarea {
    user-select: text;
}

.export-option {
    display: inline-flex;
    align-items: center;
    /* 垂直居中：复选框 + 文本 */
    gap: 6px;
    margin-top: 8px;
    margin-bottom: 8px;
    font-size: 13px;
    color: #ccc;
}

/* 导出资源 / 导出 Lua 行：整体略微上移一点，让勾选文字与输入框更对齐 */
.export-line .export-option {
    position: relative;
    top: -1px;
}

.export-option input[type='checkbox'] {
    margin: 0;
    cursor: pointer;
}

.export-option strong {
    color: #fff;
}

.export-path-group {
    margin-top: 0;
    margin-left: 0;
}

.export-path-input {
    display: flex;
    gap: 10px;
    align-items: center;
}

.export-path-inline {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 8px;
}

.export-path-inline-label {
    font-size: 12px;
    color: #aaa;
    white-space: nowrap;
}

.export-path-input input {
    /* 让路径输入框有更大的基础宽度，优先占据整行空间 */
    min-width: 410px;
}

.btn-select-path {
    padding: 6px 12px;
    background: #0e639c;
    border: 1px solid #1177bb;
    color: #fff;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    white-space: nowrap;
}

.btn-select-path:hover {
    background: #1177bb;
}

.btn-select-path:active {
    background: #0a4d73;
}

.export-footer {
    margin-top: 16px;
    display: flex;
    justify-content: flex-end;
    gap: 10px;
}

.export-plugin-select-group {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-top: 8px;
    width: 100%;
}

.custom-select-wrapper {
    position: relative;
    flex: 1;
    min-width: 200px;
}

.custom-select-button {
    width: 100%;
    padding: 6px 10px;
    background: #1e1e1e;
    border: 1px solid #3e3e42;
    border-radius: 4px;
    color: #ccc;
    font-size: 13px;
    cursor: pointer;
    text-align: left;
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.custom-select-button:hover {
    border-color: #4fc3f7;
}

.custom-select-arrow {
    font-size: 10px;
    opacity: 0.7;
}

.custom-select-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    margin-top: 4px;
    background: #252526;
    border: 1px solid #3e3e42;
    border-radius: 4px;
    max-height: 200px;
    overflow-y: auto;
    z-index: 1000;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.custom-select-option {
    padding: 8px 10px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    cursor: pointer;
    border-bottom: 1px solid #2d2d30;
}

.custom-select-option:last-child {
    border-bottom: none;
}

.custom-select-option:hover {
    background: #2a2d2e;
}

.custom-select-option.selected {
    background: #094771;
}

.plugin-name {
    flex: 1;
    color: #ccc;
}

.plugin-delete-btn {
    width: 20px;
    height: 20px;
    padding: 0;
    margin-left: 8px;
    background: #d32f2f;
    border: none;
    border-radius: 3px;
    color: white;
    font-size: 16px;
    line-height: 1;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.8;
}

.plugin-delete-btn:hover {
    opacity: 1;
    background: #f44336;
}
</style>
