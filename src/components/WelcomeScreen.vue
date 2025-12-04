<template>
    <div v-if="show" class="welcome-overlay">
        <div class="welcome-dialog">
            <h2>欢迎使用 UI 设计器</h2>
            <p>请选择要执行的操作：</p>
            <div class="welcome-actions">
                <button @click="onNew">新建空白项目</button>
                <button @click="onOpen">从文件打开项目</button>
            </div>
            <div v-if="recentProjects.length" class="recent-list">
                <h3>最近项目</h3>
                <ul>
                    <li v-for="(p, idx) in recentProjects" :key="p.path">
                        <button @click="onOpenRecent(p.path)">
                            {{ idx + 1 }}. {{ p.name }}
                        </button>
                    </li>
                </ul>
            </div>
            <p class="welcome-hint">
                按 Ctrl+W 可以关闭当前项目并返回此界面。
            </p>
        </div>
    </div>
</template>

<script setup>
const props = defineProps({
    show: { type: Boolean, default: false },
    recentProjects: { type: Array, default: () => [] },
});

const emit = defineEmits(['new', 'open', 'open-recent']);

const onNew = () => emit('new');
const onOpen = () => emit('open');
const onOpenRecent = (path) => emit('open-recent', path);
</script>

<style scoped>
.welcome-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2000;
}

.welcome-dialog {
    background: #252526;
    border-radius: 6px;
    padding: 20px 24px;
    min-width: 360px;
    max-width: 480px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6);
}

.welcome-dialog h2 {
    margin: 0 0 12px;
    font-size: 18px;
}

.welcome-dialog p {
    margin: 4px 0;
    font-size: 13px;
}

.welcome-actions {
    display: flex;
    gap: 12px;
    margin: 16px 0 8px;
}

.welcome-actions button {
    flex: 1;
}

.welcome-hint {
    font-size: 12px;
    color: #aaa;
}
</style>
