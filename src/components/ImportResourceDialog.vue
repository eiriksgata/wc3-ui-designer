<template>
    <v-dialog :model-value="show" width="620" scrim="rgba(9, 11, 15, 0.72)" @update:model-value="onDialogModelUpdate"
        persistent>
        <v-card class="import-dialog" rounded="xl" elevation="12">
            <div class="import-header">
                <h2>导入到全局资源库</h2>
                <v-btn icon variant="text" size="small" @click="close" :disabled="busy">
                    <v-icon icon="mdi-close" />
                </v-btn>
            </div>

            <div class="import-body">
                <div class="section">
                    <label>待导入文件（{{ sources.length }}）</label>
                    <div class="file-list">
                        <div v-for="(src, idx) in sources" :key="src" class="file-row">
                            <span class="file-name" :title="src">{{ shortName(src) }}</span>
                            <span class="file-ext">.{{ extOf(src) }}</span>
                            <v-btn size="x-small" variant="text" icon @click="removeSource(idx)" :disabled="busy"
                                title="从列表中移除">
                                <v-icon icon="mdi-close" size="16" />
                            </v-btn>
                        </div>
                        <div v-if="!sources.length" class="file-empty">
                            没有待导入的文件。点击下方"添加文件…"选择。
                        </div>
                    </div>
                    <v-btn size="small" variant="outlined" @click="onBrowseFiles" :disabled="busy">添加文件…</v-btn>
                </div>

                <div class="section">
                    <label for="import-subdir">目标子目录（相对全局库根）</label>
                    <v-text-field id="import-subdir" density="compact" variant="outlined" hide-details
                        v-model="subDir" placeholder="如 icons 或 ui/button；留空=根目录" :disabled="busy" />
                    <div class="hint">若目录不存在会自动创建。路径分隔符使用 / 或 \\ 均可。</div>
                </div>

                <div class="section">
                    <v-checkbox v-model="convertToBlp" density="compact" hide-details
                        :disabled="busy || !hasConvertible"
                        :label="!hasConvertible
                            ? '当前文件列表里没有可转换到 BLP 的格式'
                            : '将 PNG / JPG / BMP 转换为 BLP（TGA 保留原文件）'" />
                    <div class="hint">
                        WC3 贴图建议使用 BLP。将使用 BLP1 + JPEG（带 alpha）编码，
                        兼容性最好；转换失败的文件会自动回退为直接拷贝，并在结果里给出 warning。
                        TGA 因为 WC3 原生支持、保留原图 alpha 精度，不在此选项影响范围内。
                    </div>
                </div>

                <div class="section">
                    <v-checkbox v-model="overwrite" density="compact" hide-details
                        :disabled="busy" label="同名覆盖（关闭则自动加 -1 / -2 后缀）" />
                </div>

                <div v-if="busy || progress.total > 0" class="section progress-block">
                    <label>
                        导入进度
                        <span v-if="progress.total > 0" class="progress-count">
                            {{ progress.done }} / {{ progress.total }}
                            <span v-if="progress.errors > 0" class="progress-err">（{{ progress.errors }} 项失败）</span>
                        </span>
                    </label>
                    <v-progress-linear
                        :model-value="progressPercent"
                        :indeterminate="busy && progress.total === 0"
                        color="primary"
                        height="10"
                        rounded
                    />
                    <div v-if="progress.current" class="progress-current" :title="progress.current">
                        正在处理：{{ shortName(progress.current) }}
                    </div>
                </div>

                <div v-if="warnings.length" class="section warning-block">
                    <label>告警</label>
                    <div v-for="w in warnings" :key="w.source + w.message" class="warning-row">
                        <span class="warning-source">{{ shortName(w.source) }}</span>
                        <span class="warning-msg">{{ w.message }}</span>
                    </div>
                </div>
            </div>

            <v-card-actions class="import-footer">
                <v-btn variant="text" color="secondary" @click="close" :disabled="busy">取消</v-btn>
                <v-btn variant="flat" color="primary" @click="onConfirm" :disabled="busy || !sources.length"
                    :loading="busy">开始导入</v-btn>
            </v-card-actions>
        </v-card>
    </v-dialog>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { open as tauriOpen } from '@tauri-apps/plugin-dialog';

interface ImportWarning {
    source: string;
    message: string;
}

const props = defineProps({
    show: { type: Boolean, default: false },
    /** 初始待导入的源文件绝对路径数组 */
    initialSources: { type: Array as () => string[], default: () => [] },
    /** 初始子目录（面包屑路径） */
    initialSubDir: { type: String, default: '' },
    /** 初始 convert 开关，来自 settings.defaultConvertToBlp */
    defaultConvertToBlp: { type: Boolean, default: true },
    /** 当前全局库根路径（用于提示展示，可选） */
    rootPath: { type: String, default: '' },
    /** 后端返回的 warning（由父组件透传，便于在对话框内直接展示） */
    warnings: { type: Array as () => ImportWarning[], default: () => [] },
    /** 是否正在执行导入（防止并发点击 & 展示 loading） */
    busy: { type: Boolean, default: false },
    /** 实时导入进度（由父组件从 useGlobalResourceLibrary.importProgress 透传）。 */
    progress: {
        type: Object as () => { total: number; done: number; current: string; errors: number },
        default: () => ({ total: 0, done: 0, current: '', errors: 0 }),
    },
});

const emit = defineEmits(['update:show', 'confirm']);

const sources = ref<string[]>([]);
const subDir = ref<string>('');
const convertToBlp = ref<boolean>(true);
const overwrite = ref<boolean>(false);

const extOf = (p: string) => (p.split('.').pop() || '').toLowerCase();
const shortName = (p: string) => {
    const norm = (p || '').replace(/\\/g, '/');
    const idx = norm.lastIndexOf('/');
    return idx >= 0 ? norm.slice(idx + 1) : norm;
};

const allAlreadyBlp = computed(
    () => !!sources.value.length && sources.value.every((s) => extOf(s) === 'blp'),
);

/** 列表里是否存在"可被转成 BLP"的源文件（PNG/JPG/BMP）。
 *  TGA 不在此列——TGA WC3 原生支持，保留原文件更好。 */
const hasConvertible = computed(() =>
    sources.value.some((s) => ['png', 'jpg', 'jpeg', 'bmp'].includes(extOf(s))),
);

const progressPercent = computed(() => {
    const t = props.progress?.total || 0;
    const d = props.progress?.done || 0;
    if (t <= 0) return 0;
    return Math.min(100, Math.round((d / t) * 100));
});

watch(
    () => props.show,
    (v) => {
        if (v) {
            sources.value = [...(props.initialSources || [])];
            subDir.value = props.initialSubDir || '';
            convertToBlp.value = !!props.defaultConvertToBlp;
            overwrite.value = false;
        }
    },
    { immediate: true },
);

const onDialogModelUpdate = (value: boolean) => {
    if (!value && !props.busy) close();
};

const close = () => {
    emit('update:show', false);
};

const removeSource = (idx: number) => {
    sources.value = sources.value.filter((_, i) => i !== idx);
};

const onBrowseFiles = async () => {
    try {
        const picked = await tauriOpen({
            title: '选择要导入的图片资源',
            multiple: true,
            filters: [
                { name: '图片资源', extensions: ['blp', 'png', 'tga', 'bmp', 'jpg', 'jpeg'] },
            ],
        });
        if (!picked) return;
        const arr = Array.isArray(picked) ? picked : [picked];
        const next = Array.from(new Set([...sources.value, ...arr]));
        sources.value = next;
    } catch (e) {
        console.warn('选择文件失败', e);
    }
};

const onConfirm = () => {
    if (!sources.value.length) return;
    emit('confirm', {
        sources: [...sources.value],
        subDir: subDir.value.trim(),
        convertToBlp: convertToBlp.value,
        overwrite: overwrite.value,
    });
};
</script>

<style scoped>
.import-dialog {
    background: #2d2d30;
    border: 1px solid #3e3e42;
    display: flex;
    flex-direction: column;
    max-height: 90vh;
}

.import-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 20px;
    border-bottom: 1px solid #3e3e42;
}

.import-header h2 {
    margin: 0;
    font-size: 18px;
    color: #cccccc;
}

.import-body {
    padding: 16px 20px;
    overflow-y: auto;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.section {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.section label {
    font-size: 12px;
    color: #cccccc;
}

.hint {
    font-size: 11px;
    color: #888;
}

.file-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-height: 200px;
    overflow-y: auto;
    background: #1a1a1a;
    border: 1px solid #3e3e42;
    border-radius: 6px;
    padding: 4px 6px;
    min-height: 40px;
}

.file-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 3px 4px;
    border-radius: 4px;
    color: #dbe5f8;
    font-size: 12px;
}

.file-row:hover {
    background: #2a2f38;
}

.file-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.file-ext {
    color: #64a2ff;
    font-size: 11px;
    background: rgba(100, 162, 255, 0.12);
    padding: 1px 6px;
    border-radius: 10px;
}

.file-empty {
    color: #7a8aa8;
    font-size: 12px;
    padding: 6px 4px;
}

.warning-block {
    background: rgba(255, 187, 0, 0.08);
    border: 1px solid rgba(255, 187, 0, 0.35);
    border-radius: 6px;
    padding: 8px 10px;
}

.progress-block {
    background: rgba(100, 162, 255, 0.08);
    border: 1px solid rgba(100, 162, 255, 0.28);
    border-radius: 6px;
    padding: 10px 12px;
    gap: 6px;
}

.progress-count {
    float: right;
    color: #c8d5ef;
    font-size: 11px;
    font-weight: 500;
}

.progress-err {
    color: #f5a3a3;
    margin-left: 4px;
}

.progress-current {
    font-size: 11px;
    color: #97a4be;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.warning-row {
    font-size: 11px;
    color: #ffd98a;
    display: flex;
    gap: 8px;
    padding: 2px 0;
}

.warning-source {
    color: #c8d5ef;
    min-width: 0;
    max-width: 40%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.warning-msg {
    flex: 1;
}

.import-footer {
    padding: 12px 20px;
    border-top: 1px solid #3e3e42;
    display: flex;
    justify-content: flex-end;
    gap: 10px;
}
</style>
