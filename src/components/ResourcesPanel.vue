<template>
    <div class="resources-panel"
        :class="{ 'resources-panel--light': themeName === 'appLight', 'resources-panel--collapsed': collapsed }"
        :style="collapsed ? undefined : { height: height + 'px' }" ref="panelRef">
        <div class="resources-header" :class="{ 'resources-header--collapsed': collapsed }" @click="onToggleCollapse">
            <span>资源管理器</span>
            <span class="resources-count">共 {{ imageResources.length }} 项</span>
            <button
                class="resources-toggle-btn"
                type="button"
                :title="collapsed ? '展开资源管理器' : '折叠资源管理器'"
                @click.stop="onToggleCollapse"
            >
                {{ collapsed ? '▴' : '▾' }}
            </button>
        </div>
        <div v-if="!collapsed" class="resources-grid" ref="gridRef" @dragenter.prevent="onResourcesDragEnter"
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
        <div v-if="!collapsed && hoverPreview.visible && hoverPreview.res" class="resource-hover-preview"
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
    collapsed: { type: Boolean, default: false },
    imageResources: { type: Array, default: () => [] },
    isResourcesDragOver: { type: Boolean, default: false },
    hoverPreview: { type: Object, default: () => ({ visible: false }) },
    /** 与 App 根主题同步；用于 scoped 内浅色样式，避免依赖 :global(.app-layout.appLight) 选择器链 */
    themeName: { type: String, default: 'appDark' },
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
    'toggle-collapse',
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
const onToggleCollapse = () => emit('toggle-collapse');
</script>

<style scoped>
.resources-panel {
    flex: 0 0 auto;
    border-top: 1px solid var(--panel-border, rgba(255, 255, 255, 0.08));
    background: var(--panel-bg, linear-gradient(180deg, #232730 0%, #1f232c 100%));
    padding: 8px 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    position: relative;
}

.resources-panel--collapsed {
    padding: 4px 10px;
}

.resources-header {
    display: flex;
    justify-content: flex-start;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: #d9e2f3;
}

.resources-header--collapsed {
    cursor: pointer;
}

.resources-count {
    font-size: 11px;
    color: #97a4be;
    margin-left: auto;
}

.resources-toggle-btn {
    border: none;
    border-radius: 6px;
    background: transparent;
    color: inherit;
    font-size: 12px;
    line-height: 1;
    width: 22px;
    height: 22px;
    cursor: pointer;
}

.resources-toggle-btn:hover {
    background: rgba(255, 255, 255, 0.12);
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

.resource-item.import-item .resource-thumb {
    background: linear-gradient(145deg, #1a1d24 0%, #14161c 100%);
    border: 1px dashed rgba(100, 162, 255, 0.35);
}

.resource-item.import-item:hover .resource-thumb {
    border-color: rgba(100, 162, 255, 0.55);
}

/* 浅色：挂在根节点 modifiers 上，scoped 选择器特异性稳定，「导入资源」等标签可读 */
.resources-panel--light {
    border-top: 1px solid var(--panel-border, #d0d8e6);
    background: var(--panel-bg, linear-gradient(180deg, #eef2f9 0%, #e8edf6 100%));
    color: #243247;
}

.resources-panel--light .resources-header {
    color: #1a2433;
}

.resources-panel--light .resources-count {
    color: #5a6b85;
}

.resources-panel--light .resources-toggle-btn:hover {
    background: rgba(36, 50, 71, 0.1);
}

.resources-panel--light .resource-item {
    background: #ffffff;
    border-color: #ccd7e8;
}

.resources-panel--light .resource-item:hover {
    border-color: #3b7cff;
    background: #f5f8ff;
}

.resources-panel--light .resource-label {
    color: #0f172a;
}

.resources-panel--light .resource-item.import-item .resource-thumb {
    background: linear-gradient(180deg, #f4f7fc 0%, #eef2f9 100%);
    border: 1px dashed #a8b8d4;
}

.resources-panel--light .resource-item.import-item:hover .resource-thumb {
    border-color: #3b7cff;
    background: linear-gradient(180deg, #f0f5ff 0%, #e8f0ff 100%);
}

.resources-panel--light .resource-item.import-item .import-thumb {
    color: #2d6ae0;
}

.resources-panel--light .resources-grid.drag-over {
    background-color: rgba(43, 125, 255, 0.1);
    border-color: #3b7cff;
}

.resources-panel--light .resource-placeholder {
    color: #8899b3;
}

.resources-panel--light .resource-hover-preview {
    background: #ffffff;
    border-color: #d0d8e6;
    box-shadow: 0 8px 24px rgba(26, 43, 77, 0.12);
}

.resources-panel--light .resource-hover-label {
    color: #2d3c58;
}
</style>
