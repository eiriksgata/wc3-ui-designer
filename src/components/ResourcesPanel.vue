<template>
    <div class="resources-panel" :style="{ height: height + 'px' }" ref="panelRef">
        <div class="resources-header">
            <span>资源管理器</span>
            <span class="resources-count">共 {{ imageResources.length }} 项</span>
        </div>
        <div class="resources-grid" ref="gridRef" @dragenter.prevent="onResourcesDragEnter"
            @dragover.prevent="onResourcesDragOver" @dragleave="onResourcesDragLeave" @drop.prevent="onResourcesDrop"
            :class="{ 'drag-over': isResourcesDragOver }">
            <!-- 导入资源按钮（第一个格子） -->
            <div class="resource-item import-item" @click="onImportResourcesClick">
                <div class="resource-thumb import-thumb">
                    ＋
                </div>
                <div class="resource-label">
                    导入资源…
                </div>
            </div>
            <div v-for="res in imageResources" :key="res.value" class="resource-item"
                @click="applyResourceToSelection(res)" @mouseenter="onResourceMouseEnter(res, $event)"
                @mousemove="onResourceMouseMove($event)" @mouseleave="onResourceMouseLeave">
                <div class="resource-thumb">
                    <template v-if="res.previewUrl">
                        <img :src="res.previewUrl" :alt="res.label" />
                    </template>
                    <template v-else>
                        <div class="resource-placeholder">无预览</div>
                    </template>
                </div>
                <div class="resource-label" :title="res.value">
                    {{ res.label }}
                </div>
            </div>
        </div>
        <!-- 资源预览悬浮窗 -->
        <div v-if="hoverPreview.visible && hoverPreview.res" class="resource-hover-preview"
            :style="{ left: hoverPreview.x + 'px', top: hoverPreview.y + 'px' }">
            <template v-if="hoverPreview.res.previewUrl">
                <img :src="hoverPreview.res.previewUrl" :alt="hoverPreview.res.label" />
            </template>
            <template v-else>
                <div class="resource-placeholder">无预览</div>
            </template>
            <div class="resource-hover-label">{{ hoverPreview.res.label }}</div>
        </div>
    </div>
</template>

<script setup lang="ts">
const props = defineProps({
    height: { type: Number, default: 200 },
    imageResources: { type: Array, default: () => [] },
    isResourcesDragOver: { type: Boolean, default: false },
    hoverPreview: { type: Object, default: () => ({ visible: false }) },
});

const panelRef = defineModel('panelRef');
const gridRef = defineModel('gridRef');

const emit = defineEmits([
    'import-resources',
    'apply-resource',
    'drag-enter',
    'drag-over',
    'drag-leave',
    'drop',
    'hover-enter',
    'hover-move',
    'hover-leave',
]);

const onImportResourcesClick = () => emit('import-resources');
const applyResourceToSelection = (res) => emit('apply-resource', res);
const onResourcesDragEnter = (e) => emit('drag-enter', e);
const onResourcesDragOver = (e) => emit('drag-over', e);
const onResourcesDragLeave = (e) => emit('drag-leave', e);
const onResourcesDrop = (e) => emit('drop', e);
const onResourceMouseEnter = (res, e) => emit('hover-enter', res, e);
const onResourceMouseMove = (e) => emit('hover-move', e);
const onResourceMouseLeave = (e) => emit('hover-leave', e);
</script>

<style scoped>
.resources-panel {
    flex: 0 0 auto;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    background: linear-gradient(180deg, #232730 0%, #1f232c 100%);
    padding: 8px 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    position: relative;
}

.resources-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 12px;
    color: #d9e2f3;
}

.resources-count {
    font-size: 11px;
    color: #97a4be;
}

.resources-grid {
    flex: 1;
    overflow-x: auto;
    display: flex;
    gap: 10px;
    align-items: flex-start;
    transition: background-color 0.2s;
    padding: 2px;
    border-radius: 8px;
}

.resources-grid.drag-over {
    background-color: rgba(43, 125, 255, 0.15);
    border: 1px dashed #2d7fff;
}

.resource-item {
    width: 96px;
    background: #2b3039;
    border-radius: 8px;
    border: 1px solid #434c5b;
    padding: 6px;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.resource-item:hover {
    border-color: #64a2ff;
    background: #313847;
}

.resource-thumb {
    width: 100%;
    height: 46px;
    background: #111;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
}

.resource-thumb img {
    max-width: 100%;
    max-height: 100%;
    display: block;
}

.resource-placeholder {
    font-size: 11px;
    color: #777;
}

.resource-label {
    font-size: 11px;
    color: #dbe5f8;
    white-space: nowrap;
    text-overflow: ellipsis;
    overflow: hidden;
}

.resource-hover-preview {
    position: absolute;
    z-index: 20;
    background: #1e1e1e;
    border: 1px solid #4b5466;
    border-radius: 8px;
    padding: 6px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.6);
    pointer-events: none;
    transform: translateY(-100%);
}

.resource-hover-preview img {
    max-width: 200px;
    max-height: 200px;
    display: block;
}

.resource-hover-label {
    margin-top: 4px;
    font-size: 11px;
    color: #dbe5f8;
    white-space: nowrap;
    text-overflow: ellipsis;
    overflow: hidden;
}

.resource-item.import-item .import-thumb {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 24px;
    color: #c8d5ef;
}

:global(.app-layout.appLight) .resources-panel {
    border-top: 1px solid #d0d8e6;
    background: linear-gradient(180deg, #eef2f9 0%, #e8edf6 100%);
}

:global(.app-layout.appLight) .resources-header {
    color: #2c3c57;
}

:global(.app-layout.appLight) .resources-count {
    color: #657897;
}

:global(.app-layout.appLight) .resource-item {
    background: #ffffff;
    border-color: #ccd7e8;
}

:global(.app-layout.appLight) .resource-item:hover {
    border-color: #3b7cff;
    background: #f5f8ff;
}

:global(.app-layout.appLight) .resource-label {
    color: #2d3c58;
}
</style>
