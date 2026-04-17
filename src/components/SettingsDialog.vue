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
          <h3>画布设置</h3>
          <label for="canvas-width">画布宽度</label>
          <v-text-field id="canvas-width" type="number" density="compact" variant="outlined" hide-details v-model.number="localSettings.canvasWidth" min="100" max="10000" />

          <label for="canvas-height">画布高度</label>
          <v-text-field id="canvas-height" type="number" density="compact" variant="outlined" hide-details v-model.number="localSettings.canvasHeight" min="100" max="10000" />

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
          <h3>其他设置</h3>
          <v-checkbox v-model="localSettings.autoSave" density="compact" hide-details label="自动保存布局" />
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

const props = defineProps({
  showSettings: Boolean,
  settings: Object,
});

const emit = defineEmits(['update:showSettings', 'update:settings', 'save', 'reset']);

const localSettings = ref({ ...props.settings });

// 拖动相关状态
const dialogRef = ref(null);
const isDragging = ref(false);
const dragStart = ref({ mouseX: 0, mouseY: 0, left: 0, top: 0 });
const dialogPosition = ref({ left: null, top: null });

watch(() => props.settings, (newVal) => {
  localSettings.value = { ...newVal };
}, { deep: true });

const close = () => {
  emit('update:showSettings', false);
};

const onDialogModelUpdate = (value: boolean) => {
  if (!value) {
    close();
  }
};

const handleSave = () => {
  emit('update:settings', { ...localSettings.value });
  emit('save');
  close();
};

const handleReset = () => {
  emit('reset');
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

.settings-section label {
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

.settings-footer {
  padding: 16px 20px;
  border-top: 1px solid #3e3e42;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
</style>

