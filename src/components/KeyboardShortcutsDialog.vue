<template>
    <v-dialog
        :model-value="visible"
        width="700"
        scrim="rgba(9, 11, 15, 0.72)"
        @update:model-value="onDialogModelUpdate"
    >
        <v-card class="shortcuts-dialog" rounded="xl" elevation="12">
            <div class="shortcuts-header">
                <h2>快捷键</h2>
                <v-btn icon variant="text" size="small" @click="close">
                    <v-icon icon="mdi-close" />
                </v-btn>
            </div>
            <v-card-text class="shortcuts-content">
                <div class="shortcuts-section">
                    <h3>文件操作</h3>
                    <div class="shortcut-item">
                        <span class="shortcut-desc">新建项目</span>
                        <span class="shortcut-key">Ctrl + N</span>
                    </div>
                    <div class="shortcut-item">
                        <span class="shortcut-desc">打开项目</span>
                        <span class="shortcut-key">Ctrl + O</span>
                    </div>
                    <div class="shortcut-item">
                        <span class="shortcut-desc">保存项目</span>
                        <span class="shortcut-key">Ctrl + S</span>
                    </div>
                    <div class="shortcut-item">
                        <span class="shortcut-desc">另存为</span>
                        <span class="shortcut-key">Ctrl + Shift + S</span>
                    </div>
                    <div class="shortcut-item">
                        <span class="shortcut-desc">关闭项目</span>
                        <span class="shortcut-key">Ctrl + W</span>
                    </div>
                </div>

                <div class="shortcuts-section">
                    <h3>编辑操作</h3>
                    <div class="shortcut-item">
                        <span class="shortcut-desc">撤销</span>
                        <span class="shortcut-key">Ctrl + Z</span>
                    </div>
                    <div class="shortcut-item">
                        <span class="shortcut-desc">重做</span>
                        <span class="shortcut-key">Ctrl + Y</span>
                    </div>
                    <div class="shortcut-item">
                        <span class="shortcut-desc">复制</span>
                        <span class="shortcut-key">Ctrl + C</span>
                    </div>
                    <div class="shortcut-item">
                        <span class="shortcut-desc">粘贴</span>
                        <span class="shortcut-key">Ctrl + V</span>
                    </div>
                    <div class="shortcut-item">
                        <span class="shortcut-desc">删除选中</span>
                        <span class="shortcut-key">Del / Backspace</span>
                    </div>
                </div>

                <div class="shortcuts-section">
                    <h3>画布操作</h3>
                    <div class="shortcut-item">
                        <span class="shortcut-desc">平移画布</span>
                        <span class="shortcut-key">空格 + 拖动</span>
                    </div>
                    <div class="shortcut-item">
                        <span class="shortcut-desc">缩放画布</span>
                        <span class="shortcut-key">Ctrl + 滚轮</span>
                    </div>
                    <div class="shortcut-item">
                        <span class="shortcut-desc">切换网格显示</span>
                        <span class="shortcut-key">G</span>
                    </div>
                </div>

                <div class="shortcuts-section">
                    <h3>界面操作</h3>
                    <div class="shortcut-item">
                        <span class="shortcut-desc">放大界面</span>
                        <span class="shortcut-key">Ctrl + +</span>
                    </div>
                    <div class="shortcut-item">
                        <span class="shortcut-desc">缩小界面</span>
                        <span class="shortcut-key">Ctrl + -</span>
                    </div>
                </div>

                <div class="shortcuts-section">
                    <h3>导出操作</h3>
                    <div class="shortcut-item">
                        <span class="shortcut-desc">导出</span>
                        <span class="shortcut-key">F4</span>
                    </div>
                </div>
            </v-card-text>
            <v-card-actions class="shortcuts-footer">
                <v-btn @click="close" variant="flat" color="primary">关闭</v-btn>
            </v-card-actions>
        </v-card>
    </v-dialog>
</template>

<script setup lang="ts">
import { watch, onBeforeUnmount } from 'vue';

const props = defineProps<{
    visible: boolean;
}>();

const emit = defineEmits<{
    (e: 'update:visible', value: boolean): void;
}>();

const close = () => {
    emit('update:visible', false);
};
const onDialogModelUpdate = (value: boolean) => {
    if (!value) close();
};

const handleEscape = (ev: KeyboardEvent) => {
    if (ev.key === 'Escape' && props.visible) {
        close();
    }
};

watch(() => props.visible, (newVal) => {
    if (newVal) {
        document.addEventListener('keydown', handleEscape);
    } else {
        document.removeEventListener('keydown', handleEscape);
    }
});

onBeforeUnmount(() => {
    document.removeEventListener('keydown', handleEscape);
});
</script>

<style scoped>
.shortcuts-dialog {
    background: #2d2d30;
    border: 1px solid #3e3e42;
    border-radius: 6px;
    width: 90%;
    max-width: 600px;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
}

.shortcuts-header {
    padding: 16px 20px;
    border-bottom: 1px solid #3e3e42;
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.shortcuts-header h2 {
    margin: 0;
    font-size: 18px;
    color: #eee;
    font-weight: 500;
}

.shortcuts-content {
    overflow-y: auto;
}

.shortcuts-section {
    margin-bottom: 24px;
}

.shortcuts-section:last-child {
    margin-bottom: 0;
}

.shortcuts-section h3 {
    margin: 0 0 12px 0;
    font-size: 14px;
    color: #4ec9b0;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

.shortcut-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 0;
    border-bottom: 1px solid #252526;
}

.shortcut-item:last-child {
    border-bottom: none;
}

.shortcut-desc {
    color: #ccc;
    font-size: 13px;
}

.shortcut-key {
    color: #fff;
    font-size: 12px;
    background: #3a3a3d;
    padding: 4px 8px;
    border-radius: 3px;
    font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
    border: 1px solid #4a4a4d;
    min-width: 80px;
    text-align: center;
}

.shortcuts-footer {
    padding: 12px 20px;
    border-top: 1px solid #3e3e42;
    display: flex;
    justify-content: flex-end;
}
</style>
