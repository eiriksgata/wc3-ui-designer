<template>
    <v-dialog
        :model-value="show"
        persistent
        width="560"
        scrim="rgba(9, 11, 15, 0.76)"
    >
        <v-card class="welcome-card" rounded="xl" elevation="14">
            <div class="welcome-header">
                <h2>欢迎使用 UI 设计器</h2>
                <p>请选择要执行的操作：</p>
            </div>
            <div class="welcome-actions">
                <v-btn color="primary" size="large" variant="flat" @click="onNew">
                    新建空白项目
                </v-btn>
                <v-btn color="secondary" size="large" variant="tonal" @click="onOpen">
                    从文件打开项目
                </v-btn>
            </div>
            <div v-if="recentProjects.length" class="recent-list">
                <h3>最近项目</h3>
                <v-list bg-color="transparent" density="compact" class="recent-list-inner">
                    <v-list-item
                        v-for="(p, idx) in recentProjects"
                        :key="p.path"
                        :title="`${idx + 1}. ${p.name}`"
                        :subtitle="p.path"
                        rounded="lg"
                        class="recent-item"
                        @click="onOpenRecent(p.path)"
                    />
                </v-list>
            </div>
            <p class="welcome-hint">
                按 Ctrl+W 可以关闭当前项目并返回此界面。
            </p>
        </v-card>
    </v-dialog>
</template>

<script setup lang="ts">
import type { PropType } from 'vue';

interface RecentProject {
    name: string;
    path: string;
}

const props = defineProps({
    show: { type: Boolean, default: false },
    recentProjects: {
        type: Array as PropType<RecentProject[]>,
        default: () => [],
    },
});

const emit = defineEmits(['new', 'open', 'open-recent']);

const onNew = () => emit('new');
const onOpen = () => emit('open');
const onOpenRecent = (path) => emit('open-recent', path);
</script>

<style scoped>
.welcome-card {
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: linear-gradient(165deg, #2d3139 0%, #252831 100%);
    padding: 22px 24px 18px;
}

.welcome-header {
    margin-bottom: 16px;
}

.welcome-header h2 {
    margin: 0 0 8px;
    font-size: 24px;
    font-weight: 650;
    color: #f5f8ff;
    letter-spacing: 0.2px;
}

.welcome-header p {
    margin: 0;
    font-size: 13px;
    color: #b5c0d4;
    line-height: 1.6;
}

.welcome-actions {
    display: flex;
    gap: 12px;
    margin: 0 0 14px;
}

.recent-list {
    margin-top: 6px;
    padding: 12px;
    border-radius: 10px;
    border: 1px solid #3a3f48;
    background: rgba(17, 18, 21, 0.34);
}

.recent-list h3 {
    margin: 0 0 8px;
    font-size: 13px;
    color: #dde6f7;
    font-weight: 600;
}

.recent-list-inner {
    padding: 0;
}

.recent-item {
    margin-bottom: 6px;
    border: 1px solid transparent;
    background: rgba(43, 47, 54, 0.9);
}

.recent-item:hover {
    border-color: #4b5464;
    background: #343b47;
}

.welcome-hint {
    font-size: 12px;
    color: #99a6bb;
    margin-top: 12px;
}
</style>
