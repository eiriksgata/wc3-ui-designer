<template>
    <v-dialog :model-value="show" persistent width="500" scrim="rgba(9, 11, 15, 0.72)">
        <v-card class="close-project-card" rounded="xl" elevation="12">
            <v-card-title class="close-project-title">关闭项目</v-card-title>
            <v-card-text class="close-project-message">
                当前项目可能有未保存的修改。<br />
                请选择要执行的操作：
            </v-card-text>
            <v-card-actions class="close-project-actions">
                <v-btn variant="text" color="secondary" @click="onCancel">取消</v-btn>
                <v-btn variant="flat" color="error" @click="onDiscard">不保存关闭</v-btn>
                <v-btn variant="flat" color="primary" @click="onSaveAndClose">
                    保存并关闭
                </v-btn>
            </v-card-actions>
        </v-card>
    </v-dialog>
</template>

<script setup lang="ts">
const props = defineProps({
    show: { type: Boolean, default: false },
});

const emit = defineEmits(['save-and-close', 'discard', 'cancel']);

const onSaveAndClose = () => emit('save-and-close');
const onDiscard = () => emit('discard');
const onCancel = () => emit('cancel');
</script>

<style scoped>
.close-project-card {
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: linear-gradient(165deg, #2d3139 0%, #252831 100%);
}

.close-project-title {
    font-size: 18px;
    font-weight: 650;
    color: #f2f6ff;
    padding: 18px 20px 6px;
}

.close-project-message {
    color: #c5cfdf;
    font-size: 14px;
    line-height: 1.6;
    padding: 6px 20px 4px;
}

.close-project-actions {
    padding: 12px 16px 16px;
    display: flex;
    justify-content: flex-end;
    gap: 8px;
}
</style>
