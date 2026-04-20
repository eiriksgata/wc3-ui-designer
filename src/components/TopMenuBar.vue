<template>
    <div class="menubar">
        <v-menu location="bottom start" offset="4">
            <template #activator="{ props: menuProps }">
                <v-btn v-bind="menuProps" variant="text" density="comfortable" class="menu-activator">文件</v-btn>
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
                <v-btn v-bind="menuProps" variant="text" density="comfortable" class="menu-activator">编辑</v-btn>
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
                <v-btn v-bind="menuProps" variant="text" density="comfortable" class="menu-activator">排列</v-btn>
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
                <v-btn v-bind="menuProps" variant="text" density="comfortable" class="menu-activator">视图</v-btn>
            </template>
            <v-list density="compact" bg-color="surface" class="menu-list">
                <v-list-item :title="`网格吸附：${gridSnapEnabled ? '开' : '关'}`" @click="emit('toggle-grid-snap')" />
            </v-list>
        </v-menu>

        <v-menu location="bottom start" offset="4">
            <template #activator="{ props: menuProps }">
                <v-btn v-bind="menuProps" variant="text" density="comfortable" class="menu-activator">工具</v-btn>
            </template>
            <v-list density="compact" bg-color="surface" class="menu-list">
                <v-list-item title="导入资源文件夹" @click="emit('import-resources')" />
            </v-list>
        </v-menu>

        <v-btn variant="text" density="comfortable" class="menu-activator" @click="emit('open-settings')">设置</v-btn>
        <v-btn variant="text" density="comfortable" class="menu-activator" @click="emit('open-export')">导出 (F4)</v-btn>
        <v-btn variant="text" density="comfortable" class="menu-activator" @click="emit('open-help')">帮助</v-btn>
        <v-btn variant="text" density="comfortable" class="menu-activator" @click="emit('open-mcp-guide')">MCP（Streamable HTTP）</v-btn>
        <v-btn variant="text" density="comfortable" class="menu-activator" @click="emit('toggle-theme')">
            主题：{{ themeName === 'appDark' ? '深色' : '浅色' }}
        </v-btn>
        <span class="menubar-msg" v-if="message">{{ message }}</span>
    </div>
</template>

<script setup lang="ts">
import type { PropType } from 'vue';

interface RecentProject {
    name: string;
    path: string;
}

const props = defineProps({
    gridSnapEnabled: { type: Boolean, default: false },
    message: { type: String, default: '' },
    recentProjects: { type: Array as PropType<RecentProject[]>, default: () => [] },
    themeName: { type: String, default: 'appDark' },
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
    'toggle-theme',
]);
</script>

<style scoped>
.menubar {
    padding: 4px 8px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    background: linear-gradient(180deg, #242831 0%, #20242c 100%);
    display: flex;
    gap: 4px;
    align-items: center;
}

.menu-activator {
    min-width: auto;
    font-size: 13px;
    text-transform: none;
    letter-spacing: 0;
    color: #edf1fa;
    border-radius: 6px;
}

.menu-list {
    min-width: 220px;
    border: 1px solid rgba(255, 255, 255, 0.08);
}

.menubar-msg {
    margin-left: auto;
    font-size: 12px;
    color: #b8c5da;
}
</style>
