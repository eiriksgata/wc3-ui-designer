<template>
    <div class="menubar">
        <div class="menu">
            <span class="menu-title">文件</span>
            <div class="menu-dropdown">
                <button @click="emit('new-project')">新建 (Ctrl+N)</button>
                <button @click="emit('open-project')">打开 (Ctrl+O)</button>
                <button @click="emit('save-project')">保存 (Ctrl+S)</button>
                <button @click="emit('save-as-project')">另存为 (Ctrl+Shift+S)</button>
            </div>
        </div>
        <div class="menu">
            <span class="menu-title">编辑</span>
            <div class="menu-dropdown">
                <button @click="emit('undo')">撤销 (Ctrl+Z)</button>
                <button @click="emit('redo')">重做 (Ctrl+Y)</button>
                <button @click="emit('copy')">复制 (Ctrl+C)</button>
                <button @click="emit('paste')">粘贴 (Ctrl+V)</button>
                <button @click="emit('delete-selected')">删除选中 (Del)</button>
                <button @click="emit('clear-all')">清空全部</button>
            </div>
        </div>
        <div class="menu">
            <span class="menu-title">排列</span>
            <div class="menu-dropdown">
                <button @click="emit('align-left')">左对齐</button>
                <button @click="emit('align-top')">顶对齐</button>
                <button @click="emit('align-h-center')">水平居中</button>
                <button @click="emit('align-v-center')">垂直居中</button>
                <button @click="emit('align-same-width')">等宽</button>
                <button @click="emit('align-same-height')">等高</button>
            </div>
        </div>
        <div class="menu">
            <span class="menu-title">视图</span>
            <div class="menu-dropdown">
                <button @click="emit('toggle-grid-snap')">
                    网格吸附：{{ gridSnapEnabled ? '开' : '关' }}
                </button>
            </div>
        </div>
        <div class="menu">
            <span class="menu-title">工具</span>
            <div class="menu-dropdown">
                <button @click="emit('import-resources')">导入资源文件夹</button>
            </div>
        </div>
        <div class="menu menu-settings" @click="emit('open-settings')">
            <span class="menu-title">设置</span>
        </div>
        <div class="menu menu-export" @click="emit('open-export')">
            <span class="menu-title">导出 (F4)</span>
        </div>
        <div class="menu menu-help" @click="emit('open-help')">
            <span class="menu-title">帮助</span>
        </div>
        <span class="menubar-msg" v-if="message">{{ message }}</span>
    </div>
</template>

<script setup lang="ts">
const props = defineProps({
    gridSnapEnabled: { type: Boolean, default: false },
    message: { type: String, default: '' },
});

const emit = defineEmits([
    'new-project',
    'open-project',
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
]);
</script>

<style scoped>
.menubar {
    padding: 4px 10px;
    border-bottom: 1px solid #333;
    background: #202020;
    display: flex;
    gap: 12px;
    align-items: center;
}

.menu {
    position: relative;
    color: #eee;
    font-size: 13px;
    cursor: default;
    user-select: none;
}

.menu-title {
    padding: 2px 6px;
    border-radius: 3px;
}

.menu-title:hover {
    background: #333;
}

.menu-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    background: #2d2d30;
    border: 1px solid #3e3e42;
    border-radius: 3px;
    min-width: 140px;
    padding: 4px 0;
    display: none;
    flex-direction: column;
    z-index: 50;
}

.menu:hover .menu-dropdown {
    display: flex;
}

.menu-dropdown button {
    width: 100%;
    justify-content: flex-start;
    padding: 4px 12px;
    border-radius: 0;
    border: none;
    background: transparent;
}

.menu-dropdown button:hover {
    background: #3a3a3d;
}

.menubar-msg {
    margin-left: auto;
    font-size: 12px;
    color: #ccc;
}
</style>
