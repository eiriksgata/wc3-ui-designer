<template>
    <v-dialog
        :model-value="show"
        width="760"
        scrim="rgba(9, 11, 15, 0.72)"
        @update:model-value="onDialogModelUpdate"
    >
        <v-card class="export-dialog export-dialog-large" :style="dialogStyle" @mousedown.stop rounded="xl" elevation="12">
            <h3 class="export-header" @mousedown.prevent="onDragStart">导出选项</h3>
            <div class="export-body">
                <!-- 导出资源：勾选 + 路径整行在一行 -->
                <div class="export-section">
                    <div class="export-toggle-row">
                        <label class="export-option">
                            <v-checkbox
                                v-model="exportResourcesEnabledModel"
                                density="compact"
                                hide-details
                                color="primary"
                                label="导出资源"
                                class="export-option-checkbox"
                            />
                        </label>
                        <label class="export-option">
                            <v-checkbox
                                v-model="exportCodeEnabledModel"
                                density="compact"
                                hide-details
                                color="primary"
                                label="导出代码"
                                class="export-option-checkbox"
                            />
                            <span v-if="currentPlugin" class="export-format-badge">
                                ({{ currentPlugin.outputFormat?.toUpperCase() || 'CODE' }})
                            </span>
                        </label>
                    </div>

                    <div v-if="exportResourcesEnabledModel" class="export-line">
                        <div class="export-path-inline export-path-block">
                            <span class="export-path-inline-label">资源导出路径：</span>
                            <div class="export-path-input export-path-input-row">
                                <v-text-field
                                    id="export-resources-path"
                                    v-model="exportResourcesPathModel"
                                    placeholder="选择资源导出目录..."
                                    readonly
                                    density="compact"
                                    variant="outlined"
                                    hide-details
                                    class="export-path-text-field"
                                />
                                <v-btn @click.stop="emitSelectExportResourcesPath" class="btn-select-path" size="small" color="primary" variant="flat">选择路径</v-btn>
                            </div>
                        </div>
                    </div>

                    <div v-if="exportCodeEnabledModel" class="export-line">
                        <div class="export-path-inline export-path-block">
                            <span class="export-path-inline-label">代码导出路径：</span>
                            <div class="export-path-input export-path-input-row">
                                <v-text-field
                                    id="export-code-path"
                                    v-model="exportCodePathModel"
                                    :placeholder="`选择 ${currentPlugin?.outputFormat?.toUpperCase() || '代码'} 文件保存位置...`"
                                    readonly
                                    density="compact"
                                    variant="outlined"
                                    hide-details
                                    class="export-path-text-field"
                                />
                                <v-btn @click.stop="emitSelectExportCodePath" class="btn-select-path" size="small" color="primary" variant="flat">选择路径</v-btn>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 导出插件选择（放在导出代码下方） -->
                <div class="export-section">
                    <label for="export-plugin-select" style="display: block; margin-bottom: 8px;">选择导出插件：</label>
                    <div class="export-plugin-select-group">
                        <v-select
                            id="export-plugin-select"
                            v-model="selectedExportPluginModel"
                            :items="pluginItems"
                            item-title="title"
                            item-value="value"
                            density="compact"
                            variant="outlined"
                            hide-details
                            class="plugin-select"
                        />
                        <v-btn @click="emitLoadCustomPlugin" class="btn-select-path" size="small" color="primary" variant="flat">加载插件</v-btn>
                        <v-btn @click="emitCreateNewPlugin" class="btn-select-path" size="small" color="primary" variant="flat">新建插件</v-btn>
                        <v-btn v-if="currentPlugin && currentPlugin.type === 'custom'" @click="emitEditPlugin"
                            class="btn-select-path" size="small" color="primary" variant="flat">
                            编辑
                        </v-btn>
                        <v-btn
                            v-if="currentPlugin && currentPlugin.type === 'custom'"
                            @click="emitDeletePlugin(currentPlugin.id)"
                            class="btn-select-path"
                            size="small"
                            color="error"
                            variant="tonal"
                        >
                            删除
                        </v-btn>
                    </div>
                    <div v-if="currentPlugin && currentPlugin.description" class="plugin-description">
                        {{ currentPlugin.description }}
                    </div>
                </div>

                <div class="hint">至少选择一项导出选项。</div>
            </div>
            <v-card-actions class="export-footer">
                <v-btn @click="emitClose" variant="text" color="secondary">取消</v-btn>
                <v-btn @click="emitDoExport" variant="flat" color="primary" :disabled="!exportResourcesEnabledModel && !exportCodeEnabledModel">
                    导出
                </v-btn>
            </v-card-actions>
        </v-card>
    </v-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch, type PropType } from 'vue';

interface ExportPluginItem {
    id: string;
    name: string;
    outputFormat?: string;
    type?: string;
    description?: string;
}

const props = defineProps({
    show: { type: Boolean, default: false },
    exportPlugins: { type: Array as PropType<ExportPluginItem[]>, default: () => [] },
    // 当前 UI 缩放，用于修正拖动偏移（缩放后屏幕像素与逻辑坐标不一致）
    uiZoom: { type: Number, default: 1 },
});

const exportResourcesEnabledModel = defineModel('exportResourcesEnabled', { type: Boolean, default: false });
const exportResourcesPathModel = defineModel('exportResourcesPath', { type: String, default: '' });
const exportCodeEnabledModel = defineModel('exportCodeEnabled', { type: Boolean, default: false });
const exportCodePathModel = defineModel('exportCodePath', { type: String, default: '' });
const selectedExportPluginModel = defineModel('selectedExportPlugin', { type: String, default: 'lua-export' });

const emit = defineEmits([
    'close',
    'select-export-resources-path',
    'select-export-code-path',
    'load-custom-plugin',
    'create-new-plugin',
    'edit-plugin',
    'delete-plugin',
    'do-export',
]);

const currentPlugin = computed(() =>
    props.exportPlugins.find((p) => p.id === selectedExportPluginModel.value),
);
const pluginItems = computed(() =>
    props.exportPlugins.map((plugin) => ({
        title: `${plugin.name} (${plugin.outputFormat?.toUpperCase() || 'CODE'})${plugin.type === 'builtin' ? ' [内置]' : ''}`,
        value: plugin.id,
    })),
);
const pickingResourcesPath = ref(false);
const pickingCodePath = ref(false);

const emitClose = () => emit('close');
const emitSelectExportResourcesPath = () => {
    if (pickingResourcesPath.value) return;
    pickingResourcesPath.value = true;
    try {
        emit('select-export-resources-path');
    } finally {
        setTimeout(() => {
            pickingResourcesPath.value = false;
        }, 300);
    }
};
const emitSelectExportCodePath = () => {
    if (pickingCodePath.value) return;
    pickingCodePath.value = true;
    try {
        emit('select-export-code-path');
    } finally {
        setTimeout(() => {
            pickingCodePath.value = false;
        }, 300);
    }
};
const emitLoadCustomPlugin = () => emit('load-custom-plugin');
const emitCreateNewPlugin = () => emit('create-new-plugin');
const emitEditPlugin = () => emit('edit-plugin');
const emitDeletePlugin = (id: string) => emit('delete-plugin', id);
const emitDoExport = () => emit('do-export');
const onDialogModelUpdate = (value: boolean) => {
    if (!value) {
        emitClose();
    }
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
.export-dialog {
    background: #2d2d30;
    border: 1px solid #3e3e42;
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

.export-toggle-row {
    display: flex;
    align-items: center;
    gap: 28px;
    margin-bottom: 6px;
}

.export-section:last-child {
    border-bottom: none;
    margin-bottom: 0;
    padding-bottom: 0;
}

.export-section > label {
    display: block;
    margin: 6px 0 4px;
    font-size: 12px;
    color: #ccc;
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
    flex: 1;
    min-width: 0;
}

.export-path-inline {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
}

.export-path-block {
    flex-direction: column;
    align-items: stretch;
    gap: 6px;
}

.export-path-inline-label {
    font-size: 12px;
    color: #aaa;
    white-space: nowrap;
}

.export-path-input-row {
    width: 100%;
}

.export-path-text-field {
    flex: 1;
    min-width: 260px;
}

.export-path-text-field :deep(.v-input) {
    width: 100%;
}

.btn-select-path {
    font-size: 12px;
    white-space: nowrap;
    letter-spacing: 0;
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

.plugin-select {
    flex: 1;
    min-width: 260px;
}

.plugin-badge {
    font-size: 10px;
    color: #4ec9b0;
    margin-left: 6px;
    padding: 2px 6px;
    background: rgba(78, 201, 176, 0.1);
    border-radius: 3px;
}

.export-format-badge {
    font-size: 11px;
    color: #888;
    font-weight: normal;
    margin-left: 4px;
}

.plugin-description {
    margin-top: 6px;
    font-size: 11px;
    color: #888;
    font-style: italic;
}

.export-option-checkbox {
    margin-top: 0;
    margin-bottom: 0;
}

.export-option-checkbox :deep(.v-selection-control) {
    align-items: center;
    min-height: 24px;
}

.export-option-checkbox :deep(.v-selection-control__wrapper) {
    align-self: center;
}

.export-option-checkbox :deep(.v-label) {
    display: inline-flex;
    align-items: center;
    line-height: 24px;
}
</style>
