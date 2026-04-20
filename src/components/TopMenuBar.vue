<template>
    <div class="menubar" data-tauri-drag-region>
        <v-menu location="bottom start" offset="4">
            <template #activator="{ props: menuProps }">
                <v-btn v-bind="menuProps" variant="text" density="comfortable" class="menu-activator no-drag">文件</v-btn>
            </template>
            <v-list density="compact" bg-color="surface" class="menu-list">
                <v-list-item title="新建 (Ctrl+N)" @click="emit('new-project')" />
                <v-list-item title="打开 (Ctrl+O)" @click="emit('open-project')" />
                <v-divider v-if="recentProjects.length > 0" class="my-1" />
                <v-list-subheader v-if="recentProjects.length > 0">最近项目</v-list-subheader>
                <template v-if="recentProjects.length > 0">
                    <v-list-item
                        v-for="project in recentProjects"
                        :key="project.path"
                        :title="project.name"
                        :subtitle="project.path"
                        @click="emit('open-recent-project', project.path)"
                    />
                </template>
                <v-divider class="my-1" />
                <v-list-item title="保存 (Ctrl+S)" @click="emit('save-project')" />
                <v-list-item title="另存为 (Ctrl+Shift+S)" @click="emit('save-as-project')" />
            </v-list>
        </v-menu>

        <v-menu location="bottom start" offset="4">
            <template #activator="{ props: menuProps }">
                <v-btn v-bind="menuProps" variant="text" density="comfortable" class="menu-activator no-drag">编辑</v-btn>
            </template>
            <v-list density="compact" bg-color="surface" class="menu-list">
                <v-list-item title="撤销 (Ctrl+Z)" @click="emit('undo')" />
                <v-list-item title="重做 (Ctrl+Y)" @click="emit('redo')" />
                <v-list-item title="复制 (Ctrl+C)" @click="emit('copy')" />
                <v-list-item title="粘贴 (Ctrl+V)" @click="emit('paste')" />
                <v-list-item title="删除选中 (Del)" @click="emit('delete-selected')" />
                <v-list-item title="清空全部" @click="emit('clear-all')" />
            </v-list>
        </v-menu>

        <v-menu location="bottom start" offset="4">
            <template #activator="{ props: menuProps }">
                <v-btn v-bind="menuProps" variant="text" density="comfortable" class="menu-activator no-drag">排列</v-btn>
            </template>
            <v-list density="compact" bg-color="surface" class="menu-list">
                <v-list-item title="左对齐" @click="emit('align-left')" />
                <v-list-item title="顶对齐" @click="emit('align-top')" />
                <v-list-item title="水平居中" @click="emit('align-h-center')" />
                <v-list-item title="垂直居中" @click="emit('align-v-center')" />
                <v-list-item title="等宽" @click="emit('align-same-width')" />
                <v-list-item title="等高" @click="emit('align-same-height')" />
            </v-list>
        </v-menu>

        <v-menu location="bottom start" offset="4">
            <template #activator="{ props: menuProps }">
                <v-btn v-bind="menuProps" variant="text" density="comfortable" class="menu-activator no-drag">视图</v-btn>
            </template>
            <v-list density="compact" bg-color="surface" class="menu-list">
                <v-list-item :title="`网格吸附：${gridSnapEnabled ? '开' : '关'}`" @click="emit('toggle-grid-snap')" />
            </v-list>
        </v-menu>

        <v-menu location="bottom start" offset="4">
            <template #activator="{ props: menuProps }">
                <v-btn v-bind="menuProps" variant="text" density="comfortable" class="menu-activator no-drag">工具</v-btn>
            </template>
            <v-list density="compact" bg-color="surface" class="menu-list">
                <v-list-item title="导入资源文件夹" @click="emit('import-resources')" />
            </v-list>
        </v-menu>

        <v-btn variant="text" density="comfortable" class="menu-activator no-drag" @click="emit('open-settings')">设置</v-btn>
        <v-btn variant="text" density="comfortable" class="menu-activator no-drag" @click="emit('open-export')">导出 (F4)</v-btn>
        <v-menu location="bottom start" offset="4">
            <template #activator="{ props: menuProps }">
                <v-btn v-bind="menuProps" variant="text" density="comfortable" class="menu-activator no-drag">帮助</v-btn>
            </template>
            <v-list density="compact" bg-color="surface" class="menu-list">
                <v-list-item title="帮助" @click="emit('open-help')" />
                <v-list-item title="MCP（Streamable HTTP）" @click="emit('open-mcp-guide')" />
            </v-list>
        </v-menu>
        <div v-if="isTauriWindowReady" class="window-controls no-drag" data-tauri-drag-region="false">
            <button class="window-btn window-btn-min" type="button" aria-label="最小化" data-tauri-drag-region="false" @click="onMinimize">
                <span aria-hidden="true">−</span>
            </button>
            <button class="window-btn window-btn-max" type="button" :aria-label="isMaximized ? '还原窗口' : '最大化'"
                data-tauri-drag-region="false" @click="onToggleMaximize">
                <span aria-hidden="true">{{ isMaximized ? '❐' : '□' }}</span>
            </button>
            <button class="window-btn window-btn-close" type="button" aria-label="关闭窗口" data-tauri-drag-region="false" @click="onClose">
                <span aria-hidden="true">×</span>
            </button>
        </div>
    </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { PropType } from 'vue';

interface RecentProject {
    name: string;
    path: string;
}

const props = defineProps({
    gridSnapEnabled: { type: Boolean, default: false },
    message: { type: String, default: '' },
    recentProjects: { type: Array as PropType<RecentProject[]>, default: () => [] },
});

const emit = defineEmits([
    'new-project',
    'open-project',
    'open-recent-project',
    'save-project',
    'save-as-project',
    'undo',
    'redo',
    'copy',
    'paste',
    'delete-selected',
    'clear-all',
    'align-left',
    'align-top',
    'align-h-center',
    'align-v-center',
    'align-same-width',
    'align-same-height',
    'toggle-grid-snap',
    'import-resources',
    'open-settings',
    'open-export',
    'open-help',
    'open-mcp-guide',
]);

const isTauriWindowReady = ref(false);
const isMaximized = ref(false);
type TauriWindowRef = {
    minimize: () => Promise<void>;
    toggleMaximize: () => Promise<void>;
    close: () => Promise<void>;
    isMaximized: () => Promise<boolean>;
};
let tauriWindow: TauriWindowRef | null = null;

onMounted(async () => {
    if (!('__TAURI_INTERNALS__' in window)) return;
    try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        tauriWindow = getCurrentWindow();
        isMaximized.value = await tauriWindow.isMaximized();
        isTauriWindowReady.value = true;
    } catch {
        tauriWindow = null;
        isTauriWindowReady.value = false;
    }
});

const onMinimize = async () => {
    if (!tauriWindow) return;
    await tauriWindow.minimize();
};

const onToggleMaximize = async () => {
    if (!tauriWindow) return;
    await tauriWindow.toggleMaximize();
    isMaximized.value = await tauriWindow.isMaximized();
};

const onClose = async () => {
    if (!tauriWindow) return;
    await tauriWindow.close();
};
</script>

<style scoped>
.menubar {
    padding: 4px 8px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    background: linear-gradient(180deg, #242831 0%, #20242c 100%);
    display: flex;
    gap: 4px;
    align-items: center;
    -webkit-app-region: drag;
    app-region: drag;
}

.menu-activator {
    min-width: auto;
    font-size: 13px;
    text-transform: none;
    letter-spacing: 0;
    color: #edf1fa;
    border-radius: 6px;
}

.no-drag {
    -webkit-app-region: no-drag;
    app-region: no-drag;
}

.menu-list {
    min-width: 220px;
    border: 1px solid rgba(255, 255, 255, 0.08);
}

.menubar-msg {
    margin-left: auto;
    font-size: 12px;
    color: #b8c5da;
    user-select: none;
}

.window-controls {
    margin-left: auto;
    display: flex;
    align-items: stretch;
    height: 28px;
}

.window-btn {
    width: 44px;
    border: 0;
    outline: none;
    background: transparent;
    color: #edf1fa;
    cursor: pointer;
    font-size: 14px;
    line-height: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
}

.window-btn:hover {
    background: rgba(255, 255, 255, 0.1);
}

.window-btn-close:hover {
    background: #e81123;
}
</style>
