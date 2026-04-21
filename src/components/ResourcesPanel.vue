<template>
    <div class="resources-panel"
        :class="{ 'resources-panel--light': themeName === 'appLight', 'resources-panel--collapsed': collapsed }"
        :style="collapsed ? undefined : { height: height + 'px' }" ref="panelRef">
        <div class="resources-header" :class="{ 'resources-header--collapsed': collapsed }" @click="onToggleCollapse">
            <span>资源管理器</span>
            <!-- 子标题：全局资源库（唯一资源来源） -->
            <span v-if="!collapsed" class="resources-subtitle" title="跨项目共享的全局资源库，可在设置里配置路径">
                全局资源库<span v-if="globalRootConfigured && globalResources.length" class="subtitle-badge">{{ globalResources.length }}</span>
            </span>
            <!-- 面包屑导航 -->
            <div v-if="!collapsed" class="resources-breadcrumbs" @click.stop>
                <button class="crumb-btn" :class="{ 'crumb-btn--active': !currentPath }" type="button"
                    @click="goToPath('')" title="根目录">
                    根
                </button>
                <template v-for="(crumb, idx) in breadcrumbs" :key="crumb.path">
                    <span class="crumb-sep">/</span>
                    <button class="crumb-btn"
                        :class="{ 'crumb-btn--active': idx === breadcrumbs.length - 1 }" type="button"
                        :title="crumb.path" @click="goToPath(crumb.path)">
                        {{ crumb.name }}
                    </button>
                </template>
            </div>
            <span class="resources-count">
                <template v-if="currentPath">当前 {{ currentFolders.length }} 个文件夹 · {{ currentFiles.length }} 个资源 ·</template>
                共 {{ globalResources.length }} 项
            </span>
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
            :class="{ 'drag-over': effectiveDragOver }">
            <!-- 返回上一级 -->
            <div v-if="currentPath" class="resource-item folder-item folder-item--up"
                @click="goUp" title="返回上一级">
                <div class="resource-thumb folder-thumb">
                    <span class="folder-glyph">↩</span>
                </div>
                <div class="resource-label">..</div>
            </div>
            <!-- 导入资源按钮（第一个格子）。
                 未配置全局库时换成"去设置…"入口；避免点了出一个没法用的对话框。 -->
            <div v-if="globalRootConfigured"
                class="resource-item import-item" @click="onImportResourcesClick"
                :title="currentPath ? `导入到全局库：${currentPath}` : '导入资源到全局库…'">
                <div class="resource-thumb import-thumb">＋</div>
                <div class="resource-label">导入资源…</div>
            </div>
            <div v-else
                class="resource-item import-item import-item--disabled" @click="emit('open-settings')"
                title="请先在设置里配置全局资源库路径">
                <div class="resource-thumb import-thumb">⚠</div>
                <div class="resource-label">去设置…</div>
            </div>
            <!-- 全局资源库未配置：引导用户去设置 -->
            <div v-if="!globalRootConfigured"
                class="resources-empty-hint resources-empty-hint--global">
                尚未配置全局资源库路径，项目资源必须经过它才能保持跨机器可移植。
                <button class="inline-btn" type="button" @click="emit('open-settings')">前往设置</button>
                后即可开始导入资源。
            </div>
            <!-- 子文件夹 -->
            <div v-for="folder in currentFolders" :key="'folder:' + folder.path" class="resource-item folder-item"
                :data-folder-path="folder.path"
                @click="enterFolder(folder.name)"
                @dragenter.prevent="onFolderDragEnter(folder, $event)"
                @dragover.prevent="onFolderDragOver($event)"
                @dragleave="onFolderDragLeave(folder, $event)"
                @drop.prevent="onFolderDrop(folder, $event)"
                :class="{ 'folder-item--drag-over': dragOverFolder === folder.path }"
                :title="`${folder.name}（${folder.count} 项）`">
                <div class="resource-thumb folder-thumb">
                    <span class="folder-glyph">📁</span>
                    <span class="folder-count">{{ folder.count }}</span>
                </div>
                <div class="resource-label" :title="folder.name">
                    {{ folder.name }}
                </div>
            </div>
            <!-- 当前目录资源（来自全局库） -->
            <div v-for="res in currentFiles" :key="res.value" class="resource-item"
                @click="applyResourceToSelection(res)"
                @contextmenu.prevent="onResourceContextMenu(res, $event)"
                @mouseenter="onResourceMouseEnter(res, $event)"
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
                <button class="use-in-project-btn remove-from-project-btn" type="button"
                    title="从全局资源库删除（移到 .trash，可找回）"
                    @click.stop="emit('delete-from-global', res)">
                    ✕删除
                </button>
            </div>
            <!-- 空态提示 -->
            <div v-if="globalRootConfigured && currentFolders.length === 0 && currentFiles.length === 0"
                class="resources-empty-hint">
                {{ currentPath ? '当前目录为空，拖入文件夹即可导入到此目录' : '把文件夹拖到这里即可按目录层级导入到全局库' }}
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
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

interface ResourceItem {
    label: string;
    /** 绝对磁盘路径（= widget.image 运行时使用的值）。 */
    value: string;
    /** 全局库根的相对路径（反斜杠风格），面包屑/子目录聚合用。 */
    relPath?: string;
    localPath?: string;
    previewUrl?: string;
}

interface FolderNode {
    name: string;
    path: string;
    count: number;
}

const props = defineProps({
    height: { type: Number, default: 200 },
    collapsed: { type: Boolean, default: false },
    /** 全局资源库条目（来自 useGlobalResourceLibrary），当没有配置路径时为空数组。 */
    globalResources: { type: Array as () => ResourceItem[], default: () => [] },
    /** 全局资源库是否已配置了 root 路径；未配置时隐藏"导入到全局库"按钮并给出引导。 */
    globalRootConfigured: { type: Boolean, default: false },
    isResourcesDragOver: { type: Boolean, default: false },
    hoverPreview: { type: Object, default: () => ({ visible: false }) },
    /** 与 App 根主题同步；用于 scoped 内浅色样式，避免依赖 :global(.app-layout.appLight) 选择器链 */
    themeName: { type: String, default: 'appDark' },
});

const panelRef = defineModel('panelRef');
const gridRef = defineModel('gridRef');

const emit = defineEmits([
    /** "导入资源…"按钮：打开 ImportResourceDialog，导入到全局库。 */
    'import-resources',
    /** 从全局库软删除资源（右键 / ✕删除按钮）。 */
    'delete-from-global',
    /** 单击资源：把绝对路径 apply 到选中控件。 */
    'apply-resource',
    'drag-enter',
    'drag-over',
    'drag-leave',
    'drop',
    'drop-paths',
    'hover-enter',
    'hover-move',
    'hover-leave',
    'toggle-collapse',
    /** 未配置全局库时，让用户一键打开设置 */
    'open-settings',
]);

// 当前浏览的子目录（相对路径，使用反斜杠分隔；空字符串表示根目录）
const currentPath = ref('');
// 跨越到某个文件夹卡片之上时的高亮标识
const dragOverFolder = ref<string>('');
// 组件内部的 drag over 状态（用于 Tauri 原生拖放场景，HTML5 事件在 Tauri 里通常不触发）
const internalDragOver = ref(false);
const effectiveDragOver = computed(() => props.isResourcesDragOver || internalDragOver.value);

const normalizePath = (p: string) =>
    (p || '').replace(/\//g, '\\').replace(/^\\+|\\+$/g, '');

const currentPrefix = computed(() => {
    const cur = normalizePath(currentPath.value);
    return cur ? cur + '\\' : '';
});

// 当前目录下的直接子文件夹（聚合 + 统计项数）
// 统一从全局库聚合——这是整个面板的唯一资源源。
const currentFolders = computed<FolderNode[]>(() => {
    const prefix = currentPrefix.value;
    const counts = new Map<string, number>();
    for (const res of props.globalResources || []) {
        // 面包屑按 relPath 做；没有 relPath 的（库外资源）不参与目录聚合。
        const rel = normalizePath(res.relPath || '');
        if (!rel) continue;
        if (prefix && !rel.startsWith(prefix)) continue;
        const rest = rel.slice(prefix.length);
        const idx = rest.indexOf('\\');
        if (idx > 0) {
            const name = rest.slice(0, idx);
            counts.set(name, (counts.get(name) || 0) + 1);
        }
    }
    return Array.from(counts.entries())
        .map(([name, count]) => ({
            name,
            path: prefix ? prefix + name : name,
            count,
        }))
        .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));
});

// 当前目录下的直接文件（不含子文件夹内的）
const currentFiles = computed<ResourceItem[]>(() => {
    const prefix = currentPrefix.value;
    const out: ResourceItem[] = [];
    for (const res of props.globalResources || []) {
        const rel = normalizePath(res.relPath || '');
        if (!rel) continue;
        if (prefix && !rel.startsWith(prefix)) continue;
        const rest = rel.slice(prefix.length);
        if (!rest.includes('\\')) out.push(res);
    }
    return out;
});

const breadcrumbs = computed(() => {
    const cur = normalizePath(currentPath.value);
    if (!cur) return [] as { name: string; path: string }[];
    const segs = cur.split('\\');
    return segs.map((s, i) => ({ name: s, path: segs.slice(0, i + 1).join('\\') }));
});

const goToPath = (p: string) => {
    currentPath.value = normalizePath(p);
};

const enterFolder = (name: string) => {
    const cur = normalizePath(currentPath.value);
    currentPath.value = cur ? cur + '\\' + name : name;
};

const goUp = () => {
    const cur = normalizePath(currentPath.value);
    if (!cur) return;
    const idx = cur.lastIndexOf('\\');
    currentPath.value = idx > 0 ? cur.slice(0, idx) : '';
};

const onImportResourcesClick = () => {
    if (!props.globalRootConfigured) {
        emit('open-settings');
        return;
    }
    emit('import-resources', { basePath: currentPath.value });
};

const applyResourceToSelection = (res: ResourceItem) => emit('apply-resource', res);

/** 右键 = 从全局库删除。 */
const onResourceContextMenu = (res: ResourceItem, _e: MouseEvent) => {
    emit('delete-from-global', res);
};

const onResourcesDragEnter = (e: DragEvent) => emit('drag-enter', e);
const onResourcesDragOver = (e: DragEvent) => emit('drag-over', e);
const onResourcesDragLeave = (e: DragEvent) => {
    dragOverFolder.value = '';
    emit('drag-leave', e);
};
const onResourcesDrop = (e: DragEvent) => {
    if (dragOverFolder.value) {
        dragOverFolder.value = '';
        return;
    }
    emit('drop', e, { basePath: currentPath.value });
};

// 文件夹卡片上的拖拽：放到该文件夹里
const onFolderDragEnter = (folder: FolderNode, _e: DragEvent) => {
    dragOverFolder.value = folder.path;
};
const onFolderDragOver = (e: DragEvent) => {
    e.dataTransfer && (e.dataTransfer.dropEffect = 'copy');
};
const onFolderDragLeave = (folder: FolderNode, _e: DragEvent) => {
    if (dragOverFolder.value === folder.path) dragOverFolder.value = '';
};
const onFolderDrop = (folder: FolderNode, e: DragEvent) => {
    e.stopPropagation();
    dragOverFolder.value = '';
    emit('drop', e, { basePath: folder.path });
};

const onResourceMouseEnter = (res: ResourceItem, e: MouseEvent) => emit('hover-enter', res, e);
const onResourceMouseMove = (e: MouseEvent) => emit('hover-move', e);
const onResourceMouseLeave = () => emit('hover-leave');
const onToggleCollapse = () => emit('toggle-collapse');

/* ------------------------- Tauri 原生拖放支持 ------------------------- */
// 在 Tauri 2 中 HTML5 的 drop 事件通常不会携带真实路径（webview 安全限制）。
// 只有通过 webview.onDragDropEvent 才能拿到被拖入文件/文件夹的绝对路径。
type TauriUnlisten = () => void;
let tauriDragUnlisten: TauriUnlisten | null = null;

const getPanelElement = (): HTMLElement | null => {
    const ref = panelRef.value as any;
    if (!ref) return null;
    if (ref instanceof HTMLElement) return ref;
    if (ref.$el instanceof HTMLElement) return ref.$el;
    return null;
};

// 将 Tauri 的物理坐标转换为 CSS 视口坐标（逻辑像素）
const toClientPoint = (position: { x: number; y: number }) => {
    const dpr = window.devicePixelRatio || 1;
    return { x: position.x / dpr, y: position.y / dpr };
};

// 根据点坐标命中测试：返回该点对应的 basePath；null 表示未命中面板
const hitTestForBasePath = (clientX: number, clientY: number): string | null => {
    const panelEl = getPanelElement();
    if (!panelEl) return null;
    const panelRect = panelEl.getBoundingClientRect();
    if (
        clientX < panelRect.left ||
        clientX > panelRect.right ||
        clientY < panelRect.top ||
        clientY > panelRect.bottom
    ) {
        return null;
    }
    // 优先判断是否命中某个文件夹卡片
    const folderEls = panelEl.querySelectorAll<HTMLElement>('[data-folder-path]');
    for (let i = 0; i < folderEls.length; i++) {
        const el = folderEls[i];
        const r = el.getBoundingClientRect();
        if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) {
            return el.getAttribute('data-folder-path') || '';
        }
    }
    // 命中面板本体 → 放到当前浏览目录
    return currentPath.value;
};

// 根据坐标点同步 drag-over 视觉状态（面板整体高亮 + 具体文件夹卡片高亮）
const updateDragHoverByPoint = (clientX: number, clientY: number) => {
    const panelEl = getPanelElement();
    if (!panelEl) {
        internalDragOver.value = false;
        dragOverFolder.value = '';
        return;
    }
    const panelRect = panelEl.getBoundingClientRect();
    const insidePanel =
        clientX >= panelRect.left &&
        clientX <= panelRect.right &&
        clientY >= panelRect.top &&
        clientY <= panelRect.bottom;
    internalDragOver.value = insidePanel;

    if (!insidePanel) {
        dragOverFolder.value = '';
        return;
    }
    let hitFolder = '';
    const folderEls = panelEl.querySelectorAll<HTMLElement>('[data-folder-path]');
    for (let i = 0; i < folderEls.length; i++) {
        const el = folderEls[i];
        const r = el.getBoundingClientRect();
        if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) {
            hitFolder = el.getAttribute('data-folder-path') || '';
            break;
        }
    }
    dragOverFolder.value = hitFolder;
};

const clearDragHover = () => {
    internalDragOver.value = false;
    dragOverFolder.value = '';
};

onMounted(async () => {
    // 仅在 Tauri 环境下订阅原生拖放事件；非 Tauri 环境会 throw，被 catch 忽略
    try {
        const mod = await import('@tauri-apps/api/webview');
        const webview = mod.getCurrentWebview();
        tauriDragUnlisten = await webview.onDragDropEvent((ev: any) => {
            const payload = ev?.payload;
            if (!payload || !payload.type) return;
            if (payload.type === 'enter' || payload.type === 'over') {
                const { x, y } = toClientPoint(payload.position || { x: 0, y: 0 });
                updateDragHoverByPoint(x, y);
            } else if (payload.type === 'leave') {
                clearDragHover();
            } else if (payload.type === 'drop') {
                const { x, y } = toClientPoint(payload.position || { x: 0, y: 0 });
                const basePath = hitTestForBasePath(x, y);
                clearDragHover();
                if (basePath === null) return;
                const paths: string[] = Array.isArray(payload.paths) ? payload.paths : [];
                if (!paths.length) return;
                emit('drop-paths', paths, { basePath });
            }
        });
    } catch (e) {
        // 非 Tauri（纯浏览器）环境下忽略；HTML5 drop 回调仍可兜底
        console.debug('[ResourcesPanel] Tauri drag-drop 不可用（非 Tauri 环境）', e);
    }
});

onBeforeUnmount(() => {
    try { tauriDragUnlisten && tauriDragUnlisten(); } catch { /* noop */ }
    tauriDragUnlisten = null;
});
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
    flex-wrap: nowrap;
}

.resources-header--collapsed {
    cursor: pointer;
}

.resources-tabs {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 2px;
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.04);
}

.tab-btn {
    border: none;
    background: transparent;
    color: #c8d5ef;
    font-size: 11px;
    padding: 3px 10px;
    border-radius: 4px;
    cursor: pointer;
    white-space: nowrap;
    display: inline-flex;
    align-items: center;
    gap: 4px;
}

.tab-btn:hover {
    background: rgba(100, 162, 255, 0.18);
    color: #ffffff;
}

.tab-btn--active {
    background: rgba(100, 162, 255, 0.32);
    color: #ffffff;
}

.tab-badge {
    font-size: 10px;
    padding: 0 5px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.18);
    color: #fff;
    line-height: 14px;
}

.resources-subtitle {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    color: #c8d5ef;
    background: rgba(100, 162, 255, 0.14);
    padding: 2px 8px;
    border-radius: 10px;
    letter-spacing: 0.3px;
}

.subtitle-badge {
    font-size: 10px;
    padding: 0 5px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.18);
    color: #fff;
    line-height: 14px;
}

.count-warn {
    color: #f0b4b4;
    font-weight: 600;
}

.registered-badge {
    position: absolute;
    top: 4px;
    right: 4px;
    z-index: 1;
    width: 16px;
    height: 16px;
    line-height: 14px;
    border-radius: 50%;
    font-size: 10px;
    text-align: center;
    background: rgba(255, 255, 255, 0.08);
    color: #8a94aa;
    border: 1px solid rgba(255, 255, 255, 0.12);
    font-weight: 700;
    pointer-events: none;
}

.registered-badge--on {
    background: #2d7fff;
    color: #ffffff;
    border-color: #2d7fff;
    box-shadow: 0 0 0 2px rgba(45, 127, 255, 0.22);
}

.resource-item--registered {
    border-color: #2d5fb3;
}

.resource-item--registered:hover {
    border-color: #64a2ff;
}

.inline-btn {
    border: none;
    background: transparent;
    color: #64a2ff;
    text-decoration: underline;
    cursor: pointer;
    padding: 0 2px;
    font-size: inherit;
}

/* 主操作按钮（"+项目" / "✕移除"）：hover 时显现，避开右上角的登记徽章 */
.use-in-project-btn {
    position: absolute;
    top: 24px;
    right: 4px;
    font-size: 10px;
    padding: 2px 6px;
    border-radius: 10px;
    border: none;
    background: rgba(45, 127, 255, 0.75);
    color: #fff;
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.15s;
}

.resource-item {
    position: relative;
}

.resource-item:hover .use-in-project-btn {
    opacity: 1;
}

.remove-from-project-btn {
    background: rgba(205, 69, 69, 0.75);
}

.remove-from-project-btn:hover {
    background: rgba(232, 79, 79, 0.92);
}

/* 缺失：半透明 + 红色描边 + 左上角角标 */
.resource-item--missing {
    opacity: 0.72;
    border-color: #a13e3e !important;
    background: #332026;
}

.resource-item--missing::before {
    content: '缺失';
    position: absolute;
    top: 4px;
    left: 4px;
    z-index: 2;
    font-size: 10px;
    padding: 1px 6px;
    border-radius: 8px;
    background: rgba(205, 69, 69, 0.92);
    color: #fff;
    pointer-events: none;
    letter-spacing: 0.5px;
}

.resource-placeholder--missing {
    color: #f0b4b4;
    font-size: 12px;
    font-weight: 600;
}

.import-item--disabled {
    cursor: help;
}

.import-item--disabled .resource-thumb {
    border: 1px dashed rgba(205, 69, 69, 0.55);
    color: #f0b4b4;
}

.resources-empty-hint--global {
    color: #c8d5ef;
    font-style: normal;
}

.resources-breadcrumbs {
    display: flex;
    align-items: center;
    gap: 2px;
    min-width: 0;
    flex-shrink: 1;
    overflow-x: auto;
    max-width: 60%;
    padding: 2px 4px;
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.04);
}

.resources-breadcrumbs::-webkit-scrollbar {
    height: 4px;
}

.crumb-btn {
    border: none;
    background: transparent;
    color: #c8d5ef;
    font-size: 11px;
    padding: 2px 6px;
    border-radius: 4px;
    cursor: pointer;
    white-space: nowrap;
}

.crumb-btn:hover {
    background: rgba(100, 162, 255, 0.18);
    color: #ffffff;
}

.crumb-btn--active {
    color: #ffffff;
    background: rgba(100, 162, 255, 0.28);
}

.crumb-sep {
    color: #5a6b85;
    font-size: 11px;
    user-select: none;
}

.resources-count {
    font-size: 11px;
    color: #97a4be;
    margin-left: auto;
    white-space: nowrap;
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
    flex: 0 0 auto;
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
    position: relative;
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

.folder-item .folder-thumb {
    background: linear-gradient(145deg, #2a3244 0%, #1d2434 100%);
    border: 1px solid rgba(100, 162, 255, 0.2);
    color: #ffd98a;
}

.folder-item:hover .folder-thumb {
    border-color: rgba(100, 162, 255, 0.6);
}

.folder-glyph {
    font-size: 22px;
    line-height: 1;
}

.folder-count {
    position: absolute;
    right: 4px;
    bottom: 3px;
    font-size: 10px;
    color: #c8d5ef;
    background: rgba(0, 0, 0, 0.45);
    padding: 0 4px;
    border-radius: 8px;
    line-height: 14px;
}

.folder-item--drag-over .folder-thumb {
    border-color: #2d7fff;
    box-shadow: 0 0 0 2px rgba(45, 127, 255, 0.35) inset;
}

.folder-item--up .folder-glyph {
    color: #c8d5ef;
}

.resources-empty-hint {
    align-self: center;
    margin-left: 12px;
    font-size: 11px;
    color: #7a8aa8;
    font-style: italic;
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

.resources-panel--light .resources-breadcrumbs {
    background: rgba(36, 50, 71, 0.06);
}

.resources-panel--light .resources-tabs {
    background: rgba(36, 50, 71, 0.06);
}

.resources-panel--light .tab-btn {
    color: #2d3c58;
}

.resources-panel--light .tab-btn:hover {
    background: rgba(45, 106, 224, 0.12);
    color: #1a2433;
}

.resources-panel--light .tab-btn--active {
    background: rgba(45, 106, 224, 0.22);
    color: #1a2433;
}

.resources-panel--light .tab-badge {
    background: rgba(26, 36, 51, 0.15);
    color: #1a2433;
}

.resources-panel--light .inline-btn {
    color: #2d6ae0;
}

.resources-panel--light .crumb-btn {
    color: #2d3c58;
}

.resources-panel--light .crumb-btn:hover {
    background: rgba(45, 106, 224, 0.12);
    color: #1a2433;
}

.resources-panel--light .crumb-btn--active {
    color: #1a2433;
    background: rgba(45, 106, 224, 0.2);
}

.resources-panel--light .crumb-sep {
    color: #8899b3;
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

.resources-panel--light .folder-item .folder-thumb {
    background: linear-gradient(145deg, #f6f8fd 0%, #e9eff9 100%);
    border-color: rgba(45, 106, 224, 0.25);
    color: #c89a24;
}

.resources-panel--light .folder-count {
    color: #1a2433;
    background: rgba(255, 255, 255, 0.7);
}

.resources-panel--light .folder-item--up .folder-glyph {
    color: #2d3c58;
}

.resources-panel--light .resources-empty-hint {
    color: #5a6b85;
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

.resources-panel--light .resource-item--missing {
    background: #fff3f3;
    border-color: #e08787 !important;
}

.resources-panel--light .resource-item--missing::before {
    background: rgba(200, 58, 58, 0.92);
}

.resources-panel--light .resource-placeholder--missing {
    color: #c53030;
}
</style>
