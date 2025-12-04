<template>
    <div v-if="show" class="confirm-dialog-overlay" @click.self="onCancel">
        <div class="confirm-dialog">
            <div class="confirm-dialog-title">关闭项目</div>
            <div class="confirm-dialog-message">
                当前项目可能有未保存的修改。<br />
                请选择要执行的操作：
            </div>
            <div class="confirm-dialog-buttons">
                <button @click="onSaveAndClose" class="confirm-dialog-btn ok">
                    保存并关闭
                </button>
                <button @click="onDiscard" class="confirm-dialog-btn danger">
                    不保存关闭
                </button>
                <button @click="onCancel" class="confirm-dialog-btn cancel">
                    取消
                </button>
            </div>
        </div>
    </div>
</template>

<script setup>
const props = defineProps({
    show: { type: Boolean, default: false },
});

const emit = defineEmits(['save-and-close', 'discard', 'cancel']);

const onSaveAndClose = () => emit('save-and-close');
const onDiscard = () => emit('discard');
const onCancel = () => emit('cancel');
</script>

<style scoped>
.confirm-dialog-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
}

.confirm-dialog {
    background: #252526;
    border: 1px solid #3e3e42;
    border-radius: 8px;
    padding: 20px;
    min-width: 300px;
    max-width: 500px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
}

.confirm-dialog-title {
    font-size: 16px;
    font-weight: bold;
    color: #eee;
    margin-bottom: 12px;
}

.confirm-dialog-message {
    color: #ccc;
    font-size: 14px;
    line-height: 1.5;
    margin-bottom: 20px;
}

.confirm-dialog-buttons {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
}

.confirm-dialog-btn {
    padding: 6px 16px;
    border: none;
    border-radius: 4px;
    font-size: 13px;
    cursor: pointer;
    transition: background-color 0.2s;
}

.confirm-dialog-btn.cancel {
    background: #3e3e42;
    color: #ccc;
}

.confirm-dialog-btn.cancel:hover {
    background: #4e4e52;
}

.confirm-dialog-btn.ok {
    background: #0e639c;
    color: #fff;
}

.confirm-dialog-btn.ok:hover {
    background: #1177bb;
}

.confirm-dialog-btn.danger {
    background: #d32f2f;
    color: #fff;
}

.confirm-dialog-btn.danger:hover {
    background: #f44336;
}
</style>
