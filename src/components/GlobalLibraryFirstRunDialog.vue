<template>
    <v-dialog :model-value="show" width="560" scrim="rgba(9, 11, 15, 0.76)" persistent>
        <v-card class="grl-intro" rounded="xl" elevation="12">
            <div class="grl-header">
                <v-icon icon="mdi-folder-home-outline" size="28" color="#64a2ff" />
                <h2>首次使用：选择全局资源库位置</h2>
            </div>

            <div class="grl-body">
                <p>
                    全局资源库是一个<strong>跨项目共享</strong>的 WC3 贴图/图标仓库。
                    为了让你的项目文件只保留引用而非重复图片，资源导入时会被拷贝到这里，并可选转成 BLP。
                </p>

                <div class="warn">
                    由于 WC3 贴图资源动辄几个 GB，程序<strong>不会</strong>把资源库默认放到 C 盘，
                    位置必须由你选择。建议放到数据盘（如 <code>D:\\</code> / <code>E:\\</code>）。
                </div>

                <ul class="bullets">
                    <li>支持任意盘符，包括外接硬盘、网络盘。</li>
                    <li>所有读写走自定义 Rust 命令，不受 <code>fs:scope</code> 白名单限制。</li>
                    <li>后续可以在"设置 → 全局资源库"里更换路径，支持迁移已有资源。</li>
                </ul>
            </div>

            <v-card-actions class="grl-footer">
                <v-btn variant="text" @click="onLater">稍后再说</v-btn>
                <v-btn variant="flat" color="primary" @click="onPick">选择目录…</v-btn>
            </v-card-actions>
        </v-card>
    </v-dialog>
</template>

<script setup lang="ts">
import { open as tauriOpen } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';

interface GrlSetRootResult {
    ok: boolean;
    normalizedPath: string;
    writable: boolean;
    created: boolean;
    message: string;
}

defineProps({
    show: { type: Boolean, default: false },
});

const emit = defineEmits(['update:show', 'picked', 'later']);

const onPick = async () => {
    try {
        const picked = await tauriOpen({
            title: '选择全局资源库位置（建议放到 D:/E: 等数据盘）',
            directory: true,
            multiple: false,
        });
        if (!picked) return;
        const newPath = Array.isArray(picked) ? picked[0] : picked;
        const res = await invoke<GrlSetRootResult>('global_resource_set_root', { root: newPath });
        if (!res.ok) {
            console.warn('set_root failed:', res);
            emit('picked', { path: '', result: res });
            return;
        }
        emit('picked', { path: res.normalizedPath, result: res });
        emit('update:show', false);
    } catch (e) {
        console.error('选择全局资源库路径失败', e);
    }
};

const onLater = () => {
    emit('later');
    emit('update:show', false);
};
</script>

<style scoped>
.grl-intro {
    background: #2d2d30;
    border: 1px solid #3e3e42;
}

.grl-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 20px 20px 8px;
}

.grl-header h2 {
    margin: 0;
    font-size: 18px;
    color: #dbe5f8;
}

.grl-body {
    padding: 8px 20px 16px;
    color: #c8d5ef;
    font-size: 13px;
    line-height: 1.6;
}

.grl-body p {
    margin: 0 0 12px 0;
}

.warn {
    background: rgba(255, 187, 0, 0.1);
    border: 1px solid rgba(255, 187, 0, 0.4);
    color: #ffd98a;
    border-radius: 6px;
    padding: 10px 12px;
    margin-bottom: 12px;
    font-size: 12px;
    line-height: 1.6;
}

.bullets {
    margin: 0;
    padding-left: 20px;
    font-size: 12px;
    color: #97a4be;
}

.bullets li {
    margin-bottom: 4px;
}

code {
    background: rgba(255, 255, 255, 0.08);
    padding: 0 4px;
    border-radius: 3px;
    font-size: 11px;
}

.grl-footer {
    padding: 12px 20px;
    border-top: 1px solid #3e3e42;
    display: flex;
    justify-content: flex-end;
    gap: 10px;
}
</style>
