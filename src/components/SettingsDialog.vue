<template>
  <v-dialog
    :model-value="showSettings"
    width="560"
    scrim="rgba(9, 11, 15, 0.72)"
    @update:model-value="onDialogModelUpdate"
  >
    <v-card class="settings-dialog" ref="dialogRef" :style="dialogStyle" rounded="xl" elevation="12">
      <div class="settings-header" @mousedown.stop.prevent="onHeaderMouseDown">
        <h2>设置</h2>
        <v-btn icon variant="text" size="small" @click="close">
          <v-icon icon="mdi-close" />
        </v-btn>
      </div>
      <div class="settings-content">
        <div class="settings-section">
          <h3>外观</h3>
          <label for="theme-select">主题</label>
          <v-select
            id="theme-select"
            :model-value="themeName"
            :items="themeOptions"
            item-title="title"
            item-value="value"
            density="compact"
            variant="outlined"
            hide-details
            @update:model-value="onThemeChange"
          />
          <div class="hint">切换应用主题（类似 VSCode 的颜色主题）</div>
        </div>

        <div class="settings-section">
          <h3>画布设置</h3>
          <label for="canvas-width">画布宽度</label>
          <v-text-field
            id="canvas-width"
            type="number"
            density="compact"
            variant="outlined"
            hide-details
            v-model.number="localSettings.canvasWidth"
            :min="WC3_CANVAS_MIN_WIDTH"
            :max="WC3_CANVAS_MAX_WIDTH"
          />

          <label for="canvas-height">画布高度（随宽度，4:3）</label>
          <v-text-field
            id="canvas-height"
            density="compact"
            variant="outlined"
            hide-details
            readonly
            :model-value="canvasHeightFromWidth(localSettings.canvasWidth || WC3_CANVAS_MIN_WIDTH)"
          />
          <div class="hint">
            与魔兽争霸 3 全屏 Frame 归一化范围一致：横向约 0～{{ WC3_FRAME_UI_NORM_WIDTH }}、纵向约 0～{{ WC3_FRAME_UI_NORM_HEIGHT }}（BlzFrameSetAbsPoint 等，4:3 平面）。设计器画布为与之成比例的像素（宽 {{ WC3_CANVAS_MIN_WIDTH }}～{{ WC3_CANVAS_MAX_WIDTH }}，高由宽算出）。
          </div>

          <label for="control-panel-width">控件面板宽度</label>
          <v-text-field id="control-panel-width" type="number" density="compact" variant="outlined" hide-details v-model.number="localSettings.controlPanelWidth" min="120" max="600" />
          <div class="hint">左侧“控件面板”的宽度（像素）</div>
        </div>

        <div class="settings-section">
          <h3>标尺设置</h3>
          <label for="ruler-step">标尺步长</label>
          <v-text-field id="ruler-step" type="number" density="compact" variant="outlined" hide-details v-model.number="localSettings.rulerStep" min="10" max="500" />
          <div class="hint">标尺上显示数字的间隔（像素）</div>
        </div>

        <div class="settings-section">
          <h3>网格设置</h3>
          <label for="grid-snap-step">网格吸附步长</label>
          <v-text-field id="grid-snap-step" type="number" density="compact" variant="outlined" hide-details v-model.number="localSettings.gridSnapStep" min="1" max="1000" />
          <div class="hint">拖动控件时对齐到的网格间隔（像素）</div>
        </div>

        <div class="settings-section">
          <h3>画布背景</h3>
          <label for="canvas-bg-color">背景颜色</label>
          <input id="canvas-bg-color" name="canvas-bg-color" type="color" v-model="localSettings.canvasBgColor" />
          <div class="hint">选择画布的纯色背景</div>

          <label for="canvas-bg-image">背景图片路径</label>
          <v-text-field id="canvas-bg-image" density="compact" variant="outlined" hide-details v-model="localSettings.canvasBgImage" placeholder="输入图片 URL 或资源路径" />
          <div class="hint">留空则使用纯色背景</div>
        </div>

        <div class="settings-section">
          <h3>全局资源库</h3>
          <div class="hint" style="margin-bottom: 6px;">
            跨项目共享的 WC3 贴图/图标仓库。
            <strong>路径完全由你决定</strong>——WC3 素材动辄几个 GB，程序不会把它默认塞到 C 盘。
            所有对全局库的读写都走自定义 Rust 命令，不受 <code>fs:scope</code> 白名单限制，可以放在任意盘符/外接盘。
          </div>

          <label for="grl-path">全局资源库路径</label>
          <div class="grl-path-row">
            <v-text-field id="grl-path" density="compact" variant="outlined" hide-details readonly
              v-model="localSettings.globalResourceRootPath"
              placeholder="尚未配置，点击右侧按钮选择…" />
            <v-btn size="small" variant="outlined" @click="onPickGlobalRoot">选择目录…</v-btn>
          </div>
          <div v-if="grlStatus" class="grl-status" :class="{ 'grl-status--bad': !grlStatus.ok }">
            {{ grlStatus.message }}
            <template v-if="grlStatus.ok && freeSpaceText">· 所在盘可用空间 {{ freeSpaceText }}</template>
          </div>

          <v-checkbox v-model="localSettings.defaultConvertToBlp" density="compact" hide-details
            label="导入时默认勾选「将 PNG/JPG/BMP/TGA 转换为 BLP」" />
          <div class="hint">可以在"导入资源"对话框里逐次覆盖。</div>
        </div>

        <div class="settings-section">
          <h3>其他设置</h3>
          <v-checkbox
            v-model="localSettings.autoSave"
            density="compact"
            hide-details
            label="自动保存布局"
            class="settings-autosave-checkbox"
          />
          <div class="hint">每次修改后自动保存到本地存储</div>
        </div>
      </div>
      <v-card-actions class="settings-footer">
        <v-btn variant="text" color="secondary" @click="handleReset">重置为默认值</v-btn>
        <v-btn variant="flat" color="primary" @click="handleSave">保存</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, watch, computed, onBeforeUnmount } from 'vue';
import { open as tauriOpen } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import {
  WC3_CANVAS_MIN_WIDTH,
  WC3_CANVAS_MAX_WIDTH,
  WC3_FRAME_UI_NORM_WIDTH,
  WC3_FRAME_UI_NORM_HEIGHT,
  canvasHeightFromWidth,
  clampCanvasSize,
} from '../constants/wc3CanvasLimits';

interface GrlSetRootResult {
  ok: boolean;
  normalizedPath: string;
  writable: boolean;
  created: boolean;
  message: string;
}

const props = defineProps({
  showSettings: Boolean,
  settings: Object,
  themeName: { type: String, default: 'appDark' },
});

const emit = defineEmits([
  'update:showSettings',
  'update:settings',
  'save',
  'reset',
  'set-theme',
  /** 用户确认切换全局资源库路径，payload: { oldPath, newPath, mode: 'move' | 'copy' | 'switch' } */
  'change-global-resource-root',
]);

const themeOptions = [
  { title: '深色', value: 'appDark' },
  { title: '浅色', value: 'appLight' },
];

const localSettings = ref({ ...props.settings });

// 全局资源库路径相关状态
const grlStatus = ref<GrlSetRootResult | null>(null);
const grlFreeSpace = ref<number>(0);

const formatBytes = (bytes: number): string => {
  if (!bytes) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
};

const freeSpaceText = computed(() => formatBytes(grlFreeSpace.value));

const refreshFreeSpace = async () => {
  const p = localSettings.value.globalResourceRootPath;
  if (!p) {
    grlFreeSpace.value = 0;
    return;
  }
  try {
    const n = await invoke<number>('disk_free_space', { path: p });
    grlFreeSpace.value = Number(n) || 0;
  } catch {
    grlFreeSpace.value = 0;
  }
};

const onPickGlobalRoot = async () => {
  try {
    const picked = await tauriOpen({
      title: '选择全局资源库位置（建议放到 D:/E: 等数据盘）',
      directory: true,
      multiple: false,
      defaultPath: localSettings.value.globalResourceRootPath || undefined,
    });
    if (!picked) return;
    const newPath = Array.isArray(picked) ? picked[0] : picked;
    const oldPath = localSettings.value.globalResourceRootPath;

    const res = await invoke<GrlSetRootResult>('global_resource_set_root', { root: newPath });
    grlStatus.value = res;
    if (!res.ok) return;

    if (oldPath && oldPath !== res.normalizedPath) {
      // 已存在旧路径：让父组件弹"迁移 / 切换指针 / 取消"对话框
      emit('change-global-resource-root', { oldPath, newPath: res.normalizedPath });
      // 先把 UI 上的路径改为新路径；若用户最终取消，父组件会把 settings 改回去
      localSettings.value.globalResourceRootPath = res.normalizedPath;
    } else {
      localSettings.value.globalResourceRootPath = res.normalizedPath;
    }
    await refreshFreeSpace();
  } catch (e: any) {
    grlStatus.value = {
      ok: false,
      normalizedPath: '',
      writable: false,
      created: false,
      message: '选择路径失败：' + (e?.message || String(e)),
    };
  }
};

watch(
  () => localSettings.value.globalResourceRootPath,
  () => {
    void refreshFreeSpace();
  },
  { immediate: true },
);

// 拖动相关状态
const dialogRef = ref(null);
const isDragging = ref(false);
const dragStart = ref({ mouseX: 0, mouseY: 0, left: 0, top: 0 });
const dialogPosition = ref({ left: null, top: null });

watch(() => props.settings, (newVal) => {
  localSettings.value = { ...newVal };
}, { deep: true });

watch(
  () => localSettings.value.canvasWidth,
  (w) => {
    if (typeof w !== 'number' || Number.isNaN(w)) return;
    const clamped = Math.min(WC3_CANVAS_MAX_WIDTH, Math.max(WC3_CANVAS_MIN_WIDTH, w));
    localSettings.value.canvasHeight = canvasHeightFromWidth(clamped);
  },
);

const close = () => {
  emit('update:showSettings', false);
};

const onDialogModelUpdate = (value: boolean) => {
  if (!value) {
    close();
  }
};

const handleSave = () => {
  const { width, height } = clampCanvasSize(
    localSettings.value.canvasWidth,
    localSettings.value.canvasHeight,
  );
  localSettings.value.canvasWidth = width;
  localSettings.value.canvasHeight = height;
  emit('update:settings', { ...localSettings.value });
  emit('save');
  close();
};

const handleReset = () => {
  emit('reset');
};

const onThemeChange = (value: string | null) => {
  if (value === 'appDark' || value === 'appLight') {
    emit('set-theme', value);
  }
};

// 计算对话框样式：未拖动时使用居中；拖动后使用固定位置
const dialogStyle = computed(() => {
  if (dialogPosition.value.left == null || dialogPosition.value.top == null) {
    // 使用原来的居中布局（由 overlay 的 flex 控制）
    return {};
  }
  return {
    position: 'fixed',
    left: `${dialogPosition.value.left}px`,
    top: `${dialogPosition.value.top}px`,
    margin: '0', // 避免额外偏移
  };
});

const onHeaderMouseDown = (ev) => {
  if (ev.button !== 0) return; // 只响应左键
  const el = dialogRef.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  isDragging.value = true;
  dragStart.value = {
    mouseX: ev.clientX,
    mouseY: ev.clientY,
    left: rect.left,
    top: rect.top,
  };
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
};

const onMouseMove = (ev) => {
  if (!isDragging.value) return;
  const dx = ev.clientX - dragStart.value.mouseX;
  const dy = ev.clientY - dragStart.value.mouseY;
  dialogPosition.value = {
    left: dragStart.value.left + dx,
    top: dragStart.value.top + dy,
  };
};

const onMouseUp = () => {
  if (!isDragging.value) return;
  isDragging.value = false;
  document.removeEventListener('mousemove', onMouseMove);
  document.removeEventListener('mouseup', onMouseUp);
};

onBeforeUnmount(() => {
  document.removeEventListener('mousemove', onMouseMove);
  document.removeEventListener('mouseup', onMouseUp);
});
</script>

<style scoped>
.settings-dialog {
  background: #2d2d30;
  border: 1px solid #3e3e42;
  width: 500px;
  max-width: 90vw;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
}

.settings-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #3e3e42;
}

.settings-header h2 {
  margin: 0;
  font-size: 18px;
  color: #cccccc;
}

.settings-content {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
}

.settings-section {
  margin-bottom: 24px;
}

.settings-section:last-child {
  margin-bottom: 0;
}

.settings-section h3 {
  margin: 0 0 12px 0;
  font-size: 14px;
  color: #cccccc;
  font-weight: 600;
}

.settings-section > label {
  display: block;
  margin-bottom: 6px;
  font-size: 12px;
  color: #cccccc;
}

.settings-section input[type="number"],
.settings-section input[type="text"] {
  width: 100%;
  padding: 6px 8px;
  background: #1a1a1a;
  border: 1px solid #3e3e42;
  color: #cccccc;
  font-size: 12px;
  border-radius: 4px;
  box-sizing: border-box;
}

.settings-section input[type="number"]:focus,
.settings-section input[type="text"]:focus {
  outline: none;
  border-color: #007acc;
}

.settings-section input[type="checkbox"] {
  margin-right: 8px;
}

.settings-section .hint {
  margin-top: 4px;
  font-size: 11px;
  color: #888;
}

.settings-autosave-checkbox {
  margin-top: 2px;
}

.settings-autosave-checkbox :deep(.v-selection-control) {
  align-items: center;
  min-height: 24px;
}

.settings-autosave-checkbox :deep(.v-label) {
  display: inline-flex;
  align-items: center;
  line-height: 24px;
}

.settings-footer {
  padding: 16px 20px;
  border-top: 1px solid #3e3e42;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.grl-path-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.grl-path-row > :first-child {
  flex: 1;
}

.grl-status {
  font-size: 11px;
  color: #6fce8e;
  margin-top: 4px;
}

.grl-status--bad {
  color: #ff8f8f;
}

.settings-section code {
  background: rgba(255, 255, 255, 0.08);
  padding: 0 4px;
  border-radius: 3px;
  font-size: 11px;
}
</style>

