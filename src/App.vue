<template>
  <div class="app-layout" :style="{ '--ui-zoom': uiZoom.toFixed(2) }">
    <div class="zoom-root">
      <!-- 顶部菜单栏：跨越整个窗口，包括左侧控件面板 -->
      <TopMenuBar :grid-snap-enabled="gridSnapEnabled" :message="message" :recent-projects="recentProjects"
        @new-project="handleNewProject" @open-project="loadProjectFromFile" @open-recent-project="openRecentProject"
        @save-project="saveProjectToFile" @save-as-project="saveProjectAsFile" @undo="undoLayout" @redo="redoLayout"
        @copy="copySelection" @paste="pasteClipboard" @delete-selected="deleteSelectedWithHistory"
        @clear-all="clearAllWithHistory" @align-left="alignLeft" @align-top="alignTop" @align-h-center="alignHCenter"
        @align-v-center="alignVCenter" @align-same-width="alignSameWidth" @align-same-height="alignSameHeight"
        @toggle-grid-snap="toggleGridSnap" @import-resources="onImportResourcesClick" @open-settings="showSettings = true"
        @open-export="showExportPanel = true" @open-help="showKeyboardShortcuts = true" />

      <div class="main-row">
        <div class="left panel" :style="{ width: leftWidth + 'px' }" ref="leftPanelRef">
          <h3>控件面板</h3>
          <div class="hint">点击添加到画布中心</div>
          <div class="control-buttons">
            <button v-for="t in allWidgetTypes" :key="t.id" @click="addWidgetWithHistory(t.id)">
              {{ t.label }}
            </button>
          </div>

          <!-- 层级树 -->
          <div class="hierarchy-panel" ref="hierarchyPanelRef">
            <h4>层级树</h4>
            <div class="hierarchy-list">
              <div v-for="node in widgetTreeFlat" :key="node.id" class="tree-item" :class="{
                selected: selectedIds.includes(node.id),
                dragging: treeIsDragging && treeDragSourceId === node.id
              }" :style="{ paddingLeft: 8 + node.depth * 16 + 'px' }" :data-id="node.id"
                @mousedown.left="onTreeMouseDown(node.id, $event)" @click="selectFromTree(node.id, $event)"
                @dblclick.stop="startTreeRename(node)" @contextmenu.prevent.stop="onTreeContextMenu(node, $event)">
                <span v-if="node.hasChildren" class="tree-toggle" @click.stop="toggleTreeNode(node.id)">
                  {{ isTreeNodeExpanded(node.id) ? '▾' : '▸' }}
                </span>
                <span class="tree-label">
                  <template v-if="treeRenameId === node.id">
                    <input ref="treeRenameInputRef" v-model="treeRenameName" class="tree-rename-input"
                      @keyup.enter.stop="confirmTreeRename" @blur="confirmTreeRename" />
                  </template>
                  <template v-else>
                    {{ node.name || (typeLabel(node.type) + '#' + node.id) }}
                  </template>
                </span>
              </div>
            </div>

            <!-- 树拖拽时的跟随预览 -->
            <div v-if="treeIsDragging && dragPreviewNode" class="tree-drag-preview" :style="{
              top: treeDragPreviewPos.y + 'px',
              left: treeDragPreviewPos.x + 'px'
            }">
              <span class="tree-label">
                {{ dragPreviewNode.name || (typeLabel(dragPreviewNode.type) + '#' + dragPreviewNode.id) }}
              </span>
            </div>

            <!-- 树节点右键菜单 -->
            <div v-if="treeContextMenu.visible" class="context-menu tree-context-menu"
              :style="{ left: treeContextMenu.x + 'px', top: treeContextMenu.y + 'px' }">
              <button @click="handleTreeSetRoot">设为根节点</button>
              <button @click="handleTreeContextRename">重命名</button>
              <button @click="handleTreeDelete">删除</button>
            </div>
          </div>
        </div>
        <!-- 左侧与画布之间的拖动分隔条 -->
        <div class="v-resizer left-resizer" @mousedown.prevent="startDragLeft"></div>

        <div class="center">
          <!-- 保留一个细窄 toolbar 作为分隔线 -->
          <div class="toolbar"></div>
          <div class="canvas" :class="{ 'panning': isSpacePressed || isPanning }" ref="canvasRef"
            @mousedown="onCanvasMouseDown" @mousemove="onCanvasMouseMove" @mouseup="onCanvasMouseUp"
            @mouseleave="onCanvasMouseUp" @wheel="onCanvasWheel" @contextmenu.prevent="onCanvasContextMenu">
            <!-- 标尺左上角 -->
            <div class="ruler-corner"></div>
            <!-- 标尺：上方水平标尺（随画布平移和缩放） -->
            <div class="ruler-horizontal">
              <div v-for="x in rulerXTicks" :key="'rx-' + x" class="ruler-tick-x"
                :style="{ left: (x * canvasScale + panX) + 'px' }">
                <span v-if="x % (rulerStep * 2) === 0 || x === 0">{{ x }}</span>
              </div>
            </div>
            <!-- 标尺：左侧垂直标尺（随画布平移和缩放） -->
            <div class="ruler-vertical">
              <div v-for="y in rulerYTicks" :key="'ry-' + y" class="ruler-tick-y"
                :style="{ top: (y * canvasScale + panY) + 'px' }">
                <span v-if="y % (rulerStep * 2) === 0 || y === 0">{{ y }}</span>
              </div>
            </div>
            <!-- 画布内容区域 -->
            <div class="canvas-inner" :style="{
              width: settings.canvasWidth + 'px',
              height: settings.canvasHeight + 'px',
              transform: `translate(${panX}px, ${panY}px) scale(${canvasScale.toFixed(2)})`,
              backgroundColor: settings.canvasBgColor || '#1a1a1a',
              backgroundImage: settings.canvasBgImage ? `url(${settings.canvasBgImage})` : 'none',
              backgroundSize: 'cover',
              backgroundPosition: 'center center'
            }">
              <!-- 网格线 -->
              <template v-if="gridMode > 0">
                <div v-for="x in gridXTicks" :key="'gx-' + x" class="grid-line-x" :style="{ left: x + 'px' }"></div>
                <div v-for="y in gridYTicks" :key="'gy-' + y" class="grid-line-y" :style="{ top: y + 'px' }"></div>
              </template>

              <!-- 框选矩形 -->
              <div v-if="isSelecting" ref="selectionRectRef" class="selection-rect" :style="selectionStyle"></div>
              <div v-for="w in renderWidgets" :key="w.id" class="widget" :class="[
                w.type === 'button'
                  ? 'button'
                  : w.type === 'label'
                    ? 'label'
                    : w.type === 'input'
                      ? 'input'
                      : w.type === 'checkbox'
                        ? 'checkbox'
                        : 'combobox',
                selectedIds.includes(w.id) ? 'selected' : '',
              ]" :style="[widgetRectStyle(w), widgetVisualStyle(w)]" @mousedown.stop="startDrag(w, $event)"
                @contextmenu.prevent.stop="onWidgetContextMenu(w, $event)">
                <template v-if="w.type === 'checkbox'">
                  <div class="checkbox-box">{{ w.checked ? '✓' : '' }}</div>
                  <span>{{ w.text }}</span>
                </template>
                <template v-else-if="w.type === 'combobox'">
                  <span>{{ w.text }}</span>
                  <div class="combo-arrow">▼</div>
                </template>
                <template v-else>
                  <span>{{ w.text }}</span>
                </template>
                <!-- 右下角拖动改变大小：仅在控件被选中且未锁定时显示 -->
                <div v-if="selectedIds.includes(w.id) && !w.locked" class="resize-handle"
                  @mousedown.stop="startResize(w, $event)"></div>
              </div>
            </div>

            <!-- 画布右键菜单（放在 canvas 内部，避免缩放影响定位） -->
            <div v-if="contextMenu.visible" class="context-menu"
              :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }">
              <button @click="handleContextAdd('label')">添加标签</button>
              <button @click="handleContextAdd('button')">添加按钮</button>
              <button @click="handleContextAdd('input')">添加输入框</button>
              <button @click="handleContextAdd('checkbox')">添加复选框</button>
              <button @click="handleContextAdd('combobox')">添加下拉框</button>
              <hr />
              <button :disabled="!selectedWidget" @click="handleContextCopy">
                复制 (Ctrl+C)
              </button>
              <button :disabled="!clipboard" @click="handleContextPaste">
                粘贴 (Ctrl+V)
              </button>
              <button :disabled="!selectedWidget" @click="handleContextToggleLock">
                {{ selectedWidget && selectedWidget.locked ? '解除锁定' : '锁定' }}
              </button>
              <button :disabled="!selectedWidget" @click="handleContextDelete">
                删除 (Del)
              </button>
            </div>
          </div>
        </div>

        <!-- 画布与属性面板之间的拖动分隔条 -->
        <div class="v-resizer right-resizer" @mousedown.prevent="startDragRight"></div>

        <PropertiesPanel :right-width="rightWidth" :selected-widget="selectedWidget" :selected-ids="selectedIds"
          :all-widget-types="allWidgetTypes" :parent-candidates="parentCandidates" :image-resources="imageResources"
          :property-tabs="propertyTabs" :active-property-tab="activePropertyTab"
          :current-widget-animations="currentWidgetAnimations" :expanded-animation-id="expandedAnimationId"
          :batch-move="batchMove" :batch-size="batchSize" :batch-text="batchText" :batch-image="batchImage"
          :base-type-of="baseTypeOf" :supports-image="supportsImage"
          @update:activePropertyTab="(v) => (activePropertyTab = v)" @update:batchText="(v) => (batchText = v)"
          @update:batchImage="(v) => (batchImage = v)" @toggleAnimationCard="toggleAnimationCard"
          @previewAnimation="previewAnimation" @duplicateAnimation="duplicateAnimation"
          @removeAnimation="removeAnimation" @addAnimationForSelected="addAnimationForSelected"
          @applyBatchMove="applyBatchMove" @applyBatchSize="applyBatchSize" @applyBatchText="applyBatchText"
          @applyBatchImage="applyBatchImage" />
      </div>

      <!-- 设置对话框 -->
      <SettingsDialog v-model:showSettings="showSettings" v-model:settings="settings" @save="handleSaveSettings"
        @reset="handleResetSettings" />

      <!-- 导出面板 -->
      <ExportPanel :show="showExportPanel" :ui-zoom="uiZoom" v-model:exportResourcesEnabled="exportResourcesEnabled"
        v-model:exportResourcesPath="exportResourcesPath" v-model:exportCodeEnabled="exportCodeEnabled"
        v-model:exportCodePath="exportCodePath" v-model:selectedExportPlugin="selectedExportPlugin"
        :export-plugins="exportPlugins" @close="showExportPanel = false"
        @select-export-resources-path="selectExportResourcesPath" @select-export-code-path="selectExportCodePath"
        @load-custom-plugin="loadCustomPlugin" @create-new-plugin="createNewPlugin" @edit-plugin="handleEditPlugin"
        @delete-plugin="handleDeletePlugin" @do-export="doExport" />


      <!-- 导出结果面板 -->
      <ExportResultDialog :show="showExportResultPanel" :messages="exportResultMessages"
        @close="showExportResultPanel = false" />

      <!-- 底部资源管理器分隔条 -->
      <div class="h-resizer" @mousedown.prevent="startDragBottom"></div>

      <!-- 底部资源管理器 -->
      <ResourcesPanel :height="resourcesHeight" :image-resources="imageResources"
        :is-resources-drag-over="isResourcesDragOver" :hover-preview="hoverPreview" v-model:panelRef="resourcesPanelRef"
        v-model:gridRef="resourcesGridRef" @import-resources="onImportResourcesClick"
        @apply-resource="applyResourceToSelection" @drag-enter="onResourcesDragEnter" @drag-over="onResourcesDragOver"
        @drag-leave="onResourcesDragLeave" @drop="onResourcesDrop" @hover-enter="onResourceMouseEnter"
        @hover-move="onResourceMouseMove" @hover-leave="onResourceMouseLeave" />
      <!-- 隐藏的项目文件选择器（浏览器 / Tauri WebView 通用） -->
      <input ref="projectFileInput" type="file" accept=".uiproj,.json,application/json" style="display: none"
        @change="handleProjectFileSelected" />
      <!-- 初始/欢迎界面 -->
      <WelcomeScreen :show="showWelcome" :recent-projects="recentProjects" @new="handleWelcomeNew"
        @open="handleWelcomeOpen" @open-recent="openRecentProject" />
    </div> <!-- zoom-root -->

    <!-- 导出/插件等通用确认对话框 -->
    <div v-if="showConfirmDialog" class="confirm-dialog-overlay" @click.self="confirmDialogCancel">
      <div class="confirm-dialog">
        <div class="confirm-dialog-title">确认</div>
        <div class="confirm-dialog-message">{{ confirmDialogMessage }}</div>
        <div class="confirm-dialog-buttons">
          <button @click="confirmDialogCancel" class="confirm-dialog-btn cancel">取消</button>
          <button @click="confirmDialogOk" class="confirm-dialog-btn ok">确定</button>
        </div>
      </div>
    </div>

    <!-- 关闭项目确认对话框 -->
    <CloseProjectDialog :show="showCloseConfirm" @save-and-close="handleCloseConfirmSaveAndClose"
      @discard="handleCloseConfirmDiscard" @cancel="handleCloseConfirmCancel" />

    <!-- 插件调试输出面板 -->
    <PluginDebugDialog :show="showPluginDebugPanel" :output="pluginDebugOutput" @close="showPluginDebugPanel = false" />

    <!-- 插件编辑器对话框 -->
    <PluginEditorDialog :show="showPluginEditor" v-model:name="pluginEditorName" v-model:content="pluginEditorContent"
      :path="pluginEditorPath" @close="showPluginEditor = false" @save="savePluginEditor"
      @open-default-editor="openPluginWithDefaultEditor" />

    <!-- 快捷键帮助对话框 -->
    <KeyboardShortcutsDialog v-model:visible="showKeyboardShortcuts" />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, nextTick, onBeforeUnmount, watch } from 'vue';
import { open as tauriOpen, save as tauriSave } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile, readFile, writeFile, mkdir, readDir } from '@tauri-apps/plugin-fs';
import { decodeTgaToDataUrl } from './utils/tgaDecoder';
import SettingsDialog from './components/SettingsDialog.vue';
import WelcomeScreen from './components/WelcomeScreen.vue';
import CloseProjectDialog from './components/CloseProjectDialog.vue';
import ResourcesPanel from './components/ResourcesPanel.vue';
import ExportPanel from './components/ExportPanel.vue';
import ExportResultDialog from './components/ExportResultDialog.vue';
import PluginDebugDialog from './components/PluginDebugDialog.vue';
import PluginEditorDialog from './components/PluginEditorDialog.vue';
import KeyboardShortcutsDialog from './components/KeyboardShortcutsDialog.vue';
import TopMenuBar from './components/TopMenuBar.vue';
import PropertiesPanel from './components/PropertiesPanel.vue';
import { useSettings } from './composables/useSettings';
import { useCanvas } from './composables/useCanvas';
import { useRuler } from './composables/useRuler';
import { useGrid } from './composables/useGrid';
import { useWidgets } from './composables/useWidgets';
import { useResources } from './composables/useResources';
import { useResourceManager } from './composables/useResourceManager';
import { useHistory } from './composables/useHistory';
import { useClipboard } from './composables/useClipboard';
import { useAlignment } from './composables/useAlignment';
import { useContextMenu } from './composables/useContextMenu';
import { useBatchEdit } from './composables/useBatchEdit';
import { useRecentProjects } from './composables/useRecentProjects';
import { useUiZoom } from './composables/useUiZoom';
import { usePanelResize } from './composables/usePanelResize';
import { useProjectFile } from './composables/useProjectFile';
import { useExport } from './composables/useExport';
import { useHierarchyTree } from './composables/useHierarchyTree';
import { useKeyboard } from './composables/useKeyboard';
import { useCanvasInteraction } from './composables/useCanvasInteraction';
import { useAnimations } from './composables/useAnimations';

// 使用组合式函数
const { showSettings, settings, saveSettings, resetSettings, loadSettings } = useSettings();

// 快捷键帮助对话框显示状态
const showKeyboardShortcuts = ref(false);
const canvas = useCanvas(settings);
const { rulerStep, rulerXTicks, rulerYTicks } = useRuler(settings, canvas.canvasSize, canvas.canvasScale, canvas.panX, canvas.panY);
const { gridMode, gridSnapEnabled, gridStep, gridXTicks, gridYTicks, toggleGridSnap } = useGrid(settings);
const widgets = useWidgets();
const resources = useResources();

// 解构 canvas 相关变量
const {
  canvasRef,
  canvasSize,
  canvasScale,
  panX,
  panY,
  isSpacePressed,
  isPanning,
  panStart,
  onCanvasWheel,
} = canvas;

// 解构 widgets 相关变量
const {
  widgets: widgetsList,
  nextId,
  selectedIds,
  draggingId,
  dragOffset,
  resizingId,
  resizeStart,
  isSelecting,
  selectStart,
  selectCurrent,
  selectedWidget,
  parentCandidates,
  renderWidgets,
  selectionStyle,
  addWidget,
  moveWidgetWithChildren,
  clearAll,
  deleteSelected,
} = widgets;

// 使用历史记录 composable（撤销/重做）
const history = useHistory(widgetsList, selectedIds);
const {
  historyStack,
  futureStack,
  pushHistory,
  undoLayout,
  redoLayout,
  clearHistory,
} = history;

// 动画系统（与控件列表/选择关联）—— 需要在 pushHistory 定义之后再初始化（预览时要使用）
const animationsComposable = useAnimations(widgetsList, selectedIds);
const {
  animations,
  nextAnimId: nextAnimIdAnim,
  currentWidgetAnimations,
  addAnimationForSelected,
  removeAnimation,
  duplicateAnimation,
  getAnimationsForExport,
  previewAnimation,
} = animationsComposable;

// 动画卡片展开状态（当前展开的动画 ID）
const expandedAnimationId = ref(null);
const toggleAnimationCard = (id) => {
  expandedAnimationId.value = expandedAnimationId.value === id ? null : id;
};

// 属性面板分页（PackView：属性 / 动画）
const propertyTabs = [
  { id: 'props', label: '属性' },
  { id: 'anim', label: '动画' },
];
const activePropertyTab = ref('props');


// 解构 resources 相关变量
const {
  imageResources,
} = resources;

// 消息提示
const message = ref('');

// 欢迎界面显隐（没有项目或 Ctrl+W 关闭项目时显示）
const showWelcome = ref(true);

// 使用最近项目列表 composable
const recentProjectsComposable = useRecentProjects();
const {
  recentProjects,
  loadRecentProjects,
  saveRecentProjects,
  addRecentProject,
} = recentProjectsComposable;

// 使用 UI 缩放 composable
const uiZoomComposable = useUiZoom();
const {
  uiZoom,
  applyUiZoom,
  loadUiZoom,
} = uiZoomComposable;

// 使用资源管理器 composable（需要在 message、selectedWidget 和 uiZoom 定义之后）
const resourceManager = useResourceManager(imageResources, message, selectedWidget, uiZoom);
const {
  resourcesGridRef,
  resourcesPanelRef,
  isResourcesDragOver,
  hoverPreview,
  onResourcesDragEnter,
  onResourcesDragOver,
  onResourcesDragLeave,
  onResourcesDrop,
  onImportResourcesClick: onImportResourcesClickWrapper,
  refreshResourcePreviewsFromLocal,
  applyResourceToSelection,
  onResourceMouseEnter,
  onResourceMouseMove,
  onResourceMouseLeave,
} = resourceManager;

// 导入资源点击函数
const onImportResourcesClick = () => {
  onImportResourcesClickWrapper();
};

// 使用导出功能 composable
// 注意：saveProjectToFile 将在下面定义后传入
let saveProjectToFileForExport = null;
const exportComposable = useExport(
  widgetsList,
  imageResources,
  settings,
  message,
  () => saveProjectToFileForExport && saveProjectToFileForExport(),
  getAnimationsForExport, // 传递动画导出函数给 useExport，用于插件导出
);
const {
  showExportPanel,
  showExportResultPanel,
  exportResultMessages,
  exportResourcesEnabled,
  exportResourcesPath,
  exportCodeEnabled,
  exportCodePath,
  selectedExportPlugin,
  exportPlugins,
  showPluginEditor,
  pluginEditorContent,
  pluginEditorName,
  pluginEditorPath,
  selectExportResourcesPath,
  selectExportCodePath,
  doExport,
  resetExportConfig,
  loadCustomPlugin,
  createNewPlugin,
  editPlugin,
  deletePlugin,
  deletePluginById,
  savePluginEditor,
  showConfirmDialog,
  confirmDialogMessage,
  confirmDialogOk,
  confirmDialogCancel,
  openPluginWithDefaultEditor,
  showPluginDebugPanel,
  pluginDebugOutput,
} = exportComposable;

// 内置控件类型（始终存在）
const baseWidgetTypes = [
  { id: 'panel', label: '面板', baseType: 'panel' },
  { id: 'button', label: '按钮', baseType: 'button' },
  { id: 'text', label: '文本', baseType: 'text' },
  { id: 'model', label: '模型', baseType: 'model' },
];

// 所有可用的控件类型（用于左侧控件面板按钮）
const allWidgetTypes = computed(() => baseWidgetTypes);

// 编辑插件（包装函数，确保传递正确的值）
const handleEditPlugin = () => {
  editPlugin(selectedExportPlugin.value);
};

// 删除插件（包装函数，确保下拉列表不会立即关闭）
const handleDeletePlugin = (pluginId) => {
  console.log('删除插件:', pluginId); // 调试日志
  deletePluginById(pluginId);
  // 删除后不关闭下拉列表，让用户可以看到删除结果
};

// 使用项目文件操作 composable
const projectFile = useProjectFile(
  widgetsList,
  selectedIds,
  nextId,
  settings,
  imageResources,
  animations,
  nextAnimIdAnim,
  exportResourcesEnabled,
  exportResourcesPath,
  exportCodeEnabled,
  exportCodePath,
  selectedExportPlugin,
  exportPlugins,
  pushHistory,
  refreshResourcePreviewsFromLocal,
  addRecentProject,
  message,
  showWelcome
);
const {
  projectFileInput,
  currentProjectPath,
  buildProjectJson,
  saveProjectToFile,
  saveProjectAsFile,
  openProjectFromPath,
  loadProjectFromFile,
  handleNewProject,
  handleWelcomeNew,
  handleWelcomeOpen,
  openRecentProject,
  clearCurrentProjectPath,
} = projectFile;

// 更新 exportComposable 的 currentProjectPath 引用
exportComposable.setCurrentProjectPath(currentProjectPath);
// 更新保存项目的函数引用（用于自动保存导出配置）
saveProjectToFileForExport = saveProjectToFile;

// 监听导出配置变更，自动保存到项目文件
watch([exportResourcesEnabled, exportResourcesPath, exportCodeEnabled, exportCodePath], () => {
  // 只有在项目已打开时才自动保存
  if (currentProjectPath.value && saveProjectToFile) {
    // 使用 nextTick 避免频繁保存
    nextTick(() => {
      saveProjectToFile().catch(e => {
        console.warn('自动保存导出配置失败:', e);
      });
    });
  }
}, { deep: true });

// 层级树引用（需要在 useHierarchyTree 之前定义）
const leftPanelRef = ref(null);

// 使用层级树 composable
const hierarchyTree = useHierarchyTree(
  widgetsList,
  selectedIds,
  nextId,
  pushHistory,
  message,
  uiZoom,
  leftPanelRef
);
const {
  hierarchyPanelRef,
  treeDragPreviewPos,
  treeDragClickOffsetY,
  treeExpanded,
  isTreeNodeExpanded,
  toggleTreeNode,
  widgetTreeFlat,
  dragPreviewNode,
  selectFromTree,
  isDescendantOf,
  updateWidgetParent,
  treeDragSourceId,
  treeDragStartPos,
  treeIsDragging,
  onTreeMouseDown,
  onTreeMouseMove,
  onTreeMouseUp,
  treeContextMenu,
  treeRenameId,
  treeRenameName,
  treeRenameInputRef,
  onTreeContextMenu,
  closeTreeContextMenu,
  startTreeRename,
  handleTreeContextRename,
  confirmTreeRename,
  handleTreeSetRoot,
  handleTreeDelete: handleTreeDeleteWrapper,
} = hierarchyTree;

// 包装 handleTreeDelete 以调用 deleteSelected
const handleTreeDelete = () => {
  const id = handleTreeDeleteWrapper();
  if (id) {
    deleteSelected();
  }
};

// 关闭项目相关状态（真正执行关闭，不做确认）
const performCloseProject = () => {
  clearAll();
  animations.value = [];
  nextAnimIdAnim.value = 1;
  imageResources.value = [];
  clearHistory();
  clearCurrentProjectPath();
  resetExportConfig();
  message.value = '项目已关闭';
  showWelcome.value = true;
};

// 关闭确认对话框（自定义 UI，而不是浏览器原生 confirm）
const showCloseConfirm = ref(false);

const closeProject = () => {
  // 在欢迎界面不处理
  if (showWelcome.value) return;

  // 使用历史记录判断是否有“未保存修改”
  // 一般情况：新建/刚打开项目后，pushHistory 只会有 1 条快照；
  // 只要做过一次可撤销操作（pushHistory），长度就会 > 1。
  const hasUnsavedChanges = historyStack.value && historyStack.value.length > 1;

  // 没有改动过，直接关闭，不弹提示
  if (!hasUnsavedChanges) {
    performCloseProject();
    return;
  }

  // 有改动，弹出自定义确认面板
  showCloseConfirm.value = true;
};

const handleCloseConfirmSaveAndClose = async () => {
  showCloseConfirm.value = false;
  // 先让用户自己触发“保存项目”逻辑（菜单或 Ctrl+S），这里不强制保存，避免重复弹 Tauri 对话框
  const ok = await saveProjectToFile();
  if (ok) {
    performCloseProject();
  }
};

const handleCloseConfirmDiscard = () => {
  showCloseConfirm.value = false;
  performCloseProject();
};

const handleCloseConfirmCancel = () => {
  showCloseConfirm.value = false;
};

watch(
  uiZoom,
  () => {
    // 实际的缩放值和持久化都由 useUiZoom 内部的 applyUiZoom 处理
    applyUiZoom();
  },
  { flush: 'post' },
);

// 面板尺寸（可拖动调整）
const leftWidth = ref(settings.value.controlPanelWidth || 220);
const rightWidth = ref(260);
const resourcesHeight = ref(200);

const MIN_LEFT_WIDTH = 140;
const MAX_LEFT_WIDTH = 500;
const MIN_RIGHT_WIDTH = 180;
const MAX_RIGHT_WIDTH = 500;
const MIN_RESOURCES_HEIGHT = 120;
const MAX_RESOURCES_HEIGHT = 400;

watch(
  () => settings.value.controlPanelWidth,
  (v) => {
    if (typeof v === 'number' && !isNaN(v)) {
      leftWidth.value = Math.min(MAX_LEFT_WIDTH, Math.max(MIN_LEFT_WIDTH, v));
    }
  },
  { immediate: true },
);

const dragState = ref({
  type: null, // 'left' | 'right' | 'bottom'
  startX: 0,
  startY: 0,
  leftWidth: 0,
  rightWidth: 0,
  resourcesHeight: 0,
});

const startDragLeft = (ev) => {
  dragState.value = {
    type: 'left',
    startX: ev.clientX,
    startY: ev.clientY,
    leftWidth: leftWidth.value,
    rightWidth: rightWidth.value,
    resourcesHeight: resourcesHeight.value,
  };
  document.addEventListener('mousemove', handleDragMouseMove);
  document.addEventListener('mouseup', stopDrag);
};

const startDragRight = (ev) => {
  dragState.value = {
    type: 'right',
    startX: ev.clientX,
    startY: ev.clientY,
    leftWidth: leftWidth.value,
    rightWidth: rightWidth.value,
    resourcesHeight: resourcesHeight.value,
  };
  document.addEventListener('mousemove', handleDragMouseMove);
  document.addEventListener('mouseup', stopDrag);
};

const startDragBottom = (ev) => {
  dragState.value = {
    type: 'bottom',
    startX: ev.clientX,
    startY: ev.clientY,
    leftWidth: leftWidth.value,
    rightWidth: rightWidth.value,
    resourcesHeight: resourcesHeight.value,
  };
  document.addEventListener('mousemove', handleDragMouseMove);
  document.addEventListener('mouseup', stopDrag);
};

const handleDragMouseMove = (ev) => {
  const s = dragState.value;
  if (!s.type) return;
  const dx = ev.clientX - s.startX;
  const dy = ev.clientY - s.startY;

  if (s.type === 'left') {
    let w = s.leftWidth + dx;
    w = Math.min(MAX_LEFT_WIDTH, Math.max(MIN_LEFT_WIDTH, w));
    leftWidth.value = w;
    settings.value.controlPanelWidth = w;
  } else if (s.type === 'right') {
    let w = s.rightWidth - dx; // 向左拖动增加右侧宽度
    w = Math.min(MAX_RIGHT_WIDTH, Math.max(MIN_RIGHT_WIDTH, w));
    rightWidth.value = w;
  } else if (s.type === 'bottom') {
    let h = s.resourcesHeight - dy; // 向上拖动增加高度
    h = Math.min(MAX_RESOURCES_HEIGHT, Math.max(MIN_RESOURCES_HEIGHT, h));
    resourcesHeight.value = h;
  }
};

const stopDrag = () => {
  dragState.value.type = null;
  document.removeEventListener('mousemove', handleDragMouseMove);
  document.removeEventListener('mouseup', stopDrag);
  // 控制面板宽度拖动结束后保存到设置
  try {
    saveSettings();
  } catch (e) {
    console.warn('保存面板尺寸到设置失败', e);
  }
};

// 层级树功能已移动到 useHierarchyTree composable

// 资源管理器相关逻辑已移动到 useResourceManager composable
// 撤销/重做功能已移动到 useHistory composable

// 使用剪贴板 composable
const clipboardComposable = useClipboard(selectedWidget, widgetsList, selectedIds, nextId, pushHistory);
const {
  clipboard,
  copySelection,
  pasteClipboard,
  pasteClipboardWithHistory,
} = clipboardComposable;

// 使用右键菜单 composable
const contextMenuComposable = useContextMenu(canvasRef, uiZoom, selectedIds);
const {
  contextMenu,
  closeContextMenu,
  openContextMenu,
  onWidgetContextMenu,
  onCanvasContextMenu,
} = contextMenuComposable;

const handleContextAdd = (type) => {
  closeContextMenu();
  addWidgetWithHistory(type);
};

const handleContextCopy = () => {
  closeContextMenu();
  copySelection();
};

const handleContextPaste = () => {
  closeContextMenu();
  pasteClipboardWithHistory();
};

const handleContextToggleLock = () => {
  if (!selectedIds.value.length) {
    closeContextMenu();
    return;
  }
  pushHistory();
  const lock = !selectedWidget.value?.locked;
  widgetsList.value.forEach((w) => {
    if (selectedIds.value.includes(w.id)) {
      w.locked = lock;
    }
  });
  closeContextMenu();
};

const handleContextDelete = () => {
  closeContextMenu();
  deleteSelectedWithHistory();
};

// selectionRectRef 已移动到 useCanvasInteraction composable

// 工具函数
const typeLabel = (t) => {
  switch (t) {
    case 'label':
      return '标签';
    case 'button':
      return '按钮';
    case 'input':
      return '输入框';
    case 'checkbox':
      return '复选框';
    case 'combobox':
      return '下拉框';
    default:
      return t;
  }
};

// 根据类型获取基础类型（panel/button/text/model）
const baseTypeOf = (type) => {
  const list = allWidgetTypes.value;
  const found = list.find((t) => t.id === type);
  return found?.baseType || type;
};

const supportsImage = (t) => {
  const base = baseTypeOf(t);
  // Panel 和 Button 有主图片（Panel 背景，Button 普通状态）
  return base === 'panel' || base === 'button';
};

const widgetRectStyle = (w) => ({
  left: `${w.x}px`,
  top: `${w.y}px`,
  width: `${w.w}px`,
  height: `${w.h}px`,
});

const widgetVisualStyle = (w) => {
  const style = {};
  const res = w.image
    ? imageResources.value.find((r) => r.value === w.image)
    : null;

  // 有资源：使用资源贴图作为背景
  if (res && res.previewUrl) {
    style.backgroundImage = `url(${res.previewUrl})`;
    style.backgroundSize = '100% 100%';
    style.backgroundPosition = 'center center';
    style.backgroundRepeat = 'no-repeat';
    // 即便有背景图，如果是文本类控件，仍然应用对齐方式
  }

  // 无资源时：使用一个较浅的类型背景色，方便在编辑器里看出控件区域
  if (!res || !res.previewUrl) {
    const type = w.type;
    if (type === 'button') {
      style.backgroundColor = '#2e7d32';
    } else if (type === 'label' || baseTypeOf(type) === 'text') {
      style.backgroundColor = '#424242';
    } else if (type === 'input') {
      style.backgroundColor = '#212121';
    } else if (type === 'checkbox') {
      style.backgroundColor = '#37474f';
    } else if (type === 'combobox') {
      style.backgroundColor = '#283593';
    } else {
      style.backgroundColor = 'rgba(255,255,255,0.04)';
    }
  }

  // 文本对齐 / 字体大小在编辑器中的可视化（只针对文本基础类型）
  if (baseTypeOf(w.type) === 'text') {
    const align = w.textAlign || 'top_left';
    // 垂直方向：alignItems，水平方向：justifyContent
    if (align === 'top_left') {
      style.alignItems = 'flex-start';
      style.justifyContent = 'flex-start';
    } else if (align === 'top') {
      style.alignItems = 'flex-start';
      style.justifyContent = 'center';
    } else if (align === 'top_right') {
      style.alignItems = 'flex-start';
      style.justifyContent = 'flex-end';
    } else if (align === 'left') {
      style.alignItems = 'center';
      style.justifyContent = 'flex-start';
    } else if (align === 'center') {
      style.alignItems = 'center';
      style.justifyContent = 'center';
    } else if (align === 'right') {
      style.alignItems = 'center';
      style.justifyContent = 'flex-end';
    } else if (align === 'bottom_left') {
      style.alignItems = 'flex-end';
      style.justifyContent = 'flex-start';
    } else if (align === 'bottom') {
      style.alignItems = 'flex-end';
      style.justifyContent = 'center';
    } else if (align === 'bottom_right') {
      style.alignItems = 'flex-end';
      style.justifyContent = 'flex-end';
    }

    // 字体大小（仅用于编辑器预览，真实效果以游戏内为准）
    const size = w.fontSize || 14;
    style.fontSize = `${size}px`;
    // 描边在编辑器中不再强制预览，避免过于粗糙的效果；
    // 真实描边由游戏中的 Frame.Text:SetOutLine 负责。
    style.WebkitTextStrokeWidth = '0px';
    style.textShadow = 'none';
  }

  return style;
};

// applyResourceToSelection 已移动到 useResourceManager

// 设置相关处理函数
const handleSaveSettings = () => {
  if (saveSettings()) {
    message.value = '设置已保存';
    setTimeout(() => {
      message.value = '';
    }, 2000);
  } else {
    message.value = '保存设置失败';
  }
};

const handleResetSettings = () => {
  resetSettings();
  message.value = '已重置为默认值';
  setTimeout(() => {
    message.value = '';
  }, 2000);
};

// 项目文件操作和导出功能已移动到 useProjectFile 和 useExport composable

// 使用对齐功能 composable
const alignment = useAlignment(widgetsList, selectedIds, pushHistory, message);
const {
  alignLeft,
  alignTop,
  alignHCenter,
  alignVCenter,
  alignSameWidth,
  alignSameHeight,
} = alignment;

// 带历史记录的包装函数
const addWidgetWithHistory = (type) => {
  pushHistory();
  addWidget(type);
};

const clearAllWithHistory = () => {
  if (!widgetsList.value.length) return;
  pushHistory();
  clearAll();
};

const deleteSelectedWithHistory = () => {
  if (!selectedIds.value.length) return;
  pushHistory();
  deleteSelected();
};

// 使用批量编辑 composable
const batchEdit = useBatchEdit(widgetsList, selectedIds, pushHistory, moveWidgetWithChildren, supportsImage);
const {
  batchMove,
  batchSize,
  batchText,
  batchImage,
  applyBatchMove,
  applyBatchSize,
  applyBatchText,
  applyBatchImage,
} = batchEdit;


// 资源缩略图悬浮预览
// 所有资源管理器相关函数已移动到 useResourceManager composable

// 使用画布交互 composable
const canvasInteraction = useCanvasInteraction(
  canvasRef,
  canvasScale,
  panX,
  panY,
  isSpacePressed,
  isPanning,
  panStart,
  widgetsList,
  selectedIds,
  draggingId,
  dragOffset,
  resizingId,
  resizeStart,
  isSelecting,
  selectStart,
  selectCurrent,
  gridSnapEnabled,
  gridStep,
  moveWidgetWithChildren,
  pushHistory,
  uiZoom
);
const {
  selectionRectRef,
  startDrag,
  startResize,
  onCanvasMouseDown,
  onCanvasMouseMove,
  onCanvasMouseUp,
} = canvasInteraction;

// 画布交互功能已移动到 useCanvasInteraction composable

// 键盘事件处理
onMounted(() => {
  const updateCanvasSize = () => {
    const canvas = canvasRef.value;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    canvasSize.value = {
      width: rect.width,
      height: rect.height,
    };
  };

  const handleResize = () => updateCanvasSize();

  nextTick(() => {
    // 初始推入一份历史，用于撤销
    pushHistory();
    updateCanvasSize();
    window.addEventListener('resize', handleResize);
  });

  // 使用键盘事件处理 composable
  // 包装 pasteClipboard 以包含 pushHistory
  const pasteClipboardWithHistory = () => {
    pushHistory();
    pasteClipboard();
  };

  const keyboard = useKeyboard(
    copySelection,
    pasteClipboardWithHistory,
    undoLayout,
    redoLayout,
    saveProjectToFile,
    saveProjectAsFile,
    handleNewProject,
    loadProjectFromFile,
    closeProject,
    uiZoom,
    applyUiZoom,
    deleteSelectedWithHistory,
    selectedIds,
    isSpacePressed,
    isPanning,
    gridMode,
    doExport
  );
  const {
    setupKeyboardListeners,
    removeKeyboardListeners,
  } = keyboard;

  setupKeyboardListeners();

  // 点击空白处关闭右键菜单
  const handleDocClick = () => {
    if (contextMenu.value.visible) {
      contextMenu.value.visible = false;
    }
  };
  document.addEventListener('click', handleDocClick, true);

  // 加载设置和最近项目列表
  loadSettings();
  loadRecentProjects();
  loadUiZoom();

  try {
    const raw = window.localStorage.getItem('frame_vue_layout');
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        widgetsList.value = arr;
        nextId.value = (arr.reduce((m, w) => Math.max(m, w.id || 0), 0) || 0) + 1;
      }
    }
  } catch (e) {
    console.warn('自动加载布局失败', e);
  }

  onBeforeUnmount(() => {
    window.removeEventListener('resize', handleResize);
    removeKeyboardListeners();
    document.removeEventListener('click', handleDocClick, true);
  });
});

// 包装 handleResourcesSelected 以显示消息

</script>

<style>
.app-layout {
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.zoom-root {
  display: flex;
  flex-direction: column;
  width: calc(100% / var(--ui-zoom, 1));
  height: calc(100% / var(--ui-zoom, 1));
  transform: scale(var(--ui-zoom, 1));
  transform-origin: top left;
  /* 以左上角为原点缩放，保证菜单栏始终可见 */
}

.main-row {
  display: flex;
  flex: 1 1 auto;
  /* 垂直方向占据除了底部终端区域之外的剩余空间 */
  min-height: 0;
}

.panel {
  padding: 10px;
  border-right: 1px solid #333;
}

.left {
  /* 宽度由 settings.controlPanelWidth 控制，这里只做最小限制 */
  min-width: 120px;
  background: #252526;
  font-size: 13px;
  position: relative;
}

.left .control-buttons {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  /* 两列等宽 */
  gap: 8px;
  margin-top: 8px;
}

.left .control-buttons button {
  width: 100%;
  justify-content: center;
}

.hierarchy-panel {
  margin-top: 16px;
  padding-top: 8px;
  border-top: 1px solid #333;
  position: relative;
}

.hierarchy-panel h4 {
  margin: 0 0 6px;
  font-size: 13px;
}

.hierarchy-list {
  max-height: 260px;
  overflow: auto;
  padding-right: 4px;
}

.tree-item {
  font-size: 12px;
  padding: 2px 6px;
  border-radius: 3px;
  cursor: pointer;
  user-select: none;
}

.tree-item:hover {
  background: #333;
}

.tree-item.selected {
  background: #3f51b5;
}

.tree-item.dragging {
  opacity: 0.7;
}

.tree-drag-preview {
  position: absolute;
  pointer-events: none;
  background: #3f51b5;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 12px;
  opacity: 0.85;
  box-shadow: 0 0 4px rgba(0, 0, 0, 0.6);
  z-index: 10;
}

.prop-group {
  margin-bottom: 10px;
}

.prop-section-title {
  margin: 8px 0 4px;
  padding-top: 6px;
  border-top: 1px solid #333;
  font-size: 12px;
  font-weight: 600;
  color: #ddd;
}

.prop-subtitle {
  margin: 8px 0 4px;
  font-size: 12px;
  font-weight: 600;
  color: #ccc;
}

.prop-inline {
  display: flex;
  gap: 4px;
  align-items: center;
}

.prop-inline input {
  flex: 1 1 auto;
}

.prop-grid-2 {
  display: grid;
  grid-template-columns: auto 1fr;
  column-gap: 6px;
  row-gap: 4px;
  align-items: center;
}

.prop-group .hint-text {
  font-size: 12px;
  color: #ccc;
}

.animations-list {
  margin-top: 4px;
  margin-bottom: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.animation-card {
  border: 1px solid #444;
  border-radius: 3px;
  overflow: hidden;
  background: #222;
}

.animation-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 6px;
  cursor: pointer;
  background: #2a2a2a;
}

.animation-title {
  flex: 1;
  font-size: 12px;
}

.animation-summary {
  font-size: 11px;
  color: #aaa;
  margin-right: 4px;
}

.animation-arrow {
  font-size: 10px;
}

.animation-card-body {
  padding: 4px 6px 6px;
}

.animation-row {
  display: grid;
  grid-template-columns: 1.2fr 1fr 0.6fr 0.6fr auto auto auto;
  gap: 4px;
  align-items: center;
}

.animation-name {
  min-width: 0;
}

.animation-type {
  min-width: 0;
}

.animation-number {
  min-width: 0;
}

.animation-loop {
  white-space: nowrap;
  font-size: 12px;
}

.animation-btn {
  padding: 2px 4px;
  font-size: 11px;
}

.animation-btn.danger {
  color: #ff7676;
}

.animation-add-btn {
  margin-top: 4px;
  padding: 2px 6px;
  font-size: 12px;
}

.prop-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 8px;
  border-bottom: 1px solid #333;
}

.prop-tab {
  padding: 4px 8px;
  font-size: 12px;
  background: transparent;
  border: none;
  color: #ccc;
  cursor: pointer;
}

.prop-tab.active {
  color: #fff;
  border-bottom: 2px solid #4fc3f7;
}

/* 属性面板默认禁止文字选中，避免拖动时整块变蓝；表单控件单独放开 */
.right {
  flex: 0 0 260px;
  /* 固定宽度，不参与压缩，避免被挤掉 */
  background: #252526;
  border-right: none;
  border-left: 1px solid #333;
  user-select: none;
}

.right input,
.right textarea,
.right select {
  user-select: text;
}

.resources-grid {
  display: flex;
  flex-wrap: wrap;
  align-content: flex-start;
  gap: 8px;
  overflow-y: auto;
  padding: 8px 4px;
}

.resource-item.import-item .import-thumb {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  color: #ccc;
}

.right {
  flex: 0 0 260px;
  /* 固定宽度，不参与压缩，避免被挤掉 */
  background: #252526;
  border-right: none;
  border-left: 1px solid #333;
}

.center {
  flex: 1 1 auto;
  min-width: 0;
  /* 允许中间区域在窗口变窄时收缩，保证右侧属性面板始终可见 */
  display: flex;
  flex-direction: column;
  background: #1e1e1e;
}

.v-resizer {
  width: 4px;
  cursor: col-resize;
  background: transparent;
}

.left-resizer,
.right-resizer {
  background: transparent;
}

.h-resizer {
  height: 4px;
  cursor: row-resize;
  background: transparent;
}

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

.export-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1500;
}

.export-dialog {
  background: #2d2d30;
  border: 1px solid #3e3e42;
  border-radius: 8px;
  width: 420px;
  max-width: 90vw;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
  padding: 16px 20px;
}

.export-dialog-large {
  width: 600px;
  max-width: 90vw;
}

.export-dialog h3 {
  margin: 0 0 16px 0;
  font-size: 16px;
  color: #ccc;
}

.export-body {
  max-height: 60vh;
  overflow-y: auto;
}

.export-section {
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 1px solid #3e3e42;
}

.export-section:last-child {
  border-bottom: none;
  margin-bottom: 0;
  padding-bottom: 0;
}

.export-body label {
  display: block;
  margin: 6px 0 4px;
  font-size: 12px;
  color: #ccc;
}

.export-body input[type='text'] {
  width: 100%;
  padding: 6px 8px;
  background: #1a1a1a;
  border: 1px solid #3e3e42;
  color: #ccc;
  border-radius: 4px;
  box-sizing: border-box;
}

.export-option {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  margin-bottom: 12px;
  font-size: 13px;
  color: #ccc;
}

.export-option input[type='checkbox'] {
  margin: 0;
  cursor: pointer;
}

.export-option strong {
  color: #fff;
}

.export-path-group {
  margin-top: 8px;
  margin-left: 24px;
}

.export-path-group label {
  display: block;
  margin-bottom: 6px;
  font-size: 12px;
  color: #aaa;
}

.export-path-input {
  display: flex;
  gap: 8px;
  align-items: center;
}

.export-path-input input {
  flex: 1;
  min-width: 0;
}

.btn-select-path {
  padding: 6px 12px;
  background: #0e639c;
  border: 1px solid #1177bb;
  color: #fff;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  white-space: nowrap;
}

.btn-select-path:hover {
  background: #1177bb;
}

.btn-select-path:active {
  background: #0a4d73;
}

.export-result-dialog {
  max-height: 70vh;
  overflow-y: auto;
}

.export-result-body {
  max-height: 400px;
  overflow-y: auto;
  padding: 8px 0;
}

.export-result-item {
  padding: 8px 12px;
  margin-bottom: 8px;
  background: #252526;
  border-left: 3px solid #4fc3f7;
  border-radius: 4px;
  word-break: break-word;
}

.export-result-item:last-child {
  margin-bottom: 0;
}

.export-result-text {
  color: #ccc;
  font-size: 13px;
  line-height: 1.5;
}

.export-plugin-select-group {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 8px;
  width: 100%;
}

.export-plugin-select {
  flex: 1;
  min-width: 200px;
  padding: 6px 10px;
  background: #1e1e1e;
  border: 1px solid #3e3e42;
  border-radius: 4px;
  color: #ccc;
  font-size: 13px;
  cursor: pointer;
}

.export-plugin-select:focus {
  outline: none;
  border-color: #4fc3f7;
}

.export-plugin-select option {
  background: #1e1e1e;
  color: #ccc;
}

/* 自定义下拉列表样式 */
.custom-select-wrapper {
  position: relative;
  flex: 1;
  min-width: 200px;
}

.custom-select-button {
  width: 100%;
  padding: 6px 10px;
  background: #1e1e1e;
  border: 1px solid #3e3e42;
  border-radius: 4px;
  color: #ccc;
  font-size: 13px;
  cursor: pointer;
  text-align: left;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.custom-select-button:hover {
  border-color: #4fc3f7;
}

.custom-select-arrow {
  font-size: 10px;
  opacity: 0.7;
}

.custom-select-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: 4px;
  background: #252526;
  border: 1px solid #3e3e42;
  border-radius: 4px;
  max-height: 200px;
  overflow-y: auto;
  z-index: 1000;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.custom-select-option {
  padding: 8px 10px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  border-bottom: 1px solid #2d2d30;
}

.custom-select-option:last-child {
  border-bottom: none;
}

.custom-select-option:hover {
  background: #2a2d2e;
}

.custom-select-option.selected {
  background: #094771;
}

.plugin-name {
  flex: 1;
  color: #ccc;
}

.plugin-delete-btn {
  width: 20px;
  height: 20px;
  padding: 0;
  margin-left: 8px;
  background: #d32f2f;
  border: none;
  border-radius: 3px;
  color: white;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.8;
}

.plugin-delete-btn:hover {
  opacity: 1;
  background: #f44336;
}

/* 确认对话框样式 */
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

.plugin-editor-dialog {
  max-width: 800px;
  width: 90vw;
}

.plugin-editor-name-input {
  width: 100%;
  padding: 6px 10px;
  background: #1e1e1e;
  border: 1px solid #3e3e42;
  border-radius: 4px;
  color: #ccc;
  font-size: 13px;
}

.plugin-editor-name-input:focus {
  outline: none;
  border-color: #4fc3f7;
}

.plugin-editor-textarea {
  width: 100%;
  min-height: 300px;
  padding: 8px;
  background: #1e1e1e;
  border: 1px solid #3e3e42;
  border-radius: 4px;
  color: #ccc;
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 13px;
  line-height: 1.5;
  resize: vertical;
}

.plugin-editor-textarea:focus {
  outline: none;
  border-color: #4fc3f7;
}

.export-footer {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.btn-open-editor {
  margin-right: auto;
  background: #2d2d30;
  color: #ccc;
}

.btn-open-editor:hover {
  background: #3a3a3d;
}

.lua-debug-output {
  width: 100%;
  min-height: 200px;
  max-height: 500px;
  padding: 12px;
  background: #1e1e1e;
  border: 1px solid #3e3e42;
  border-radius: 4px;
  color: #d4d4d4;
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 12px;
  line-height: 1.5;
  overflow: auto;
  white-space: pre-wrap;
  word-wrap: break-word;
}

.context-menu {
  position: absolute;
  background: #2d2d30;
  border: 1px solid #3e3e42;
  border-radius: 4px;
  padding: 4px 0;
  z-index: 2000;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  display: inline-block;
  /* 让容器宽度随内容自适应 */
}

.context-menu button {
  display: block;
  /* 占一整行，方便点击 */
  width: 100%;
  /* 宽度跟随菜单容器 */
  justify-content: flex-start;
  border: none;
  background: transparent;
  padding: 4px 12px;
  border-radius: 0;
  text-align: left;
}

.context-menu button:hover:not(:disabled) {
  background: #3a3a3d;
}

.context-menu button:disabled {
  opacity: 0.5;
  cursor: default;
}

.context-menu hr {
  margin: 4px 0;
  border: none;
  border-top: 1px solid #3e3e42;
}

.toolbar {
  height: 2px;
  border-bottom: 1px solid #333;
  background: #202020;
}

.toolbar .msg {
  font-size: 12px;
  color: #ccc;
  margin-left: 8px;
}

h3 {
  font-size: 14px;
  margin-bottom: 6px;
}

.hint {
  font-size: 12px;
  margin-bottom: 6px;
}

button {
  font-size: 13px;
  padding: 6px 10px;
  margin: 3px 0;
  cursor: pointer;
  border-radius: 3px;
  border: 1px solid #555;
  background: #333;
  color: #eee;
}

button:hover {
  background: #444;
}

input[type='text'],
input[type='number'],
select,
textarea {
  width: 100%;
  margin: 2px 0 6px;
  padding: 4px 6px;
  border-radius: 3px;
  border: 1px solid #555;
  background: #1e1e1e;
  color: #eee;
  font-size: 12px;
}

textarea {
  resize: vertical;
  min-height: 60px;
}

label {
  font-size: 12px;
  display: block;
  margin-top: 4px;
  margin-bottom: 2px;
  color: #ccc;
}

.parent-display {
  font-size: 12px;
  padding: 4px 6px;
  border-radius: 3px;
  border: 1px solid #555;
  background: #1e1e1e;
  color: #eee;
}

.canvas {
  flex: 1;
  margin: 0;
  border: 1px solid #333;
  background: #1a1a1a;
  overflow: hidden;
  position: relative;
}

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

.canvas.panning {
  cursor: grab;
}

.canvas.panning:active {
  cursor: grabbing;
}

.canvas-inner {
  position: relative;
  transform-origin: top left;
  margin-top: 0;
  margin-left: 0;
  background: radial-gradient(circle at top left, #303030, #1a1a1a);
}

.ruler-horizontal {
  position: absolute;
  left: 0;
  top: 0;
  right: 0;
  height: 20px;
  background: #2d2d30;
  border-bottom: 1px solid #3e3e42;
  font-size: 10px;
  color: #cccccc;
  pointer-events: none;
  z-index: 10;
}

.ruler-vertical {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 26px;
  background: #2d2d30;
  border-right: 1px solid #3e3e42;
  font-size: 10px;
  color: #cccccc;
  pointer-events: none;
  z-index: 10;
}

.ruler-corner {
  position: absolute;
  left: 0;
  top: 0;
  width: 26px;
  height: 20px;
  background: #2d2d30;
  border-right: 1px solid #3e3e42;
  border-bottom: 1px solid #3e3e42;
  z-index: 11;
  pointer-events: none;
}

.ruler-tick-x {
  position: absolute;
  top: 0;
  width: 1px;
  height: 100%;
  background: #5a5a5a;
  z-index: 11;
  pointer-events: none;
}

.ruler-tick-x span {
  position: absolute;
  top: 3px;
  left: 3px;
  font-size: 10px;
  color: #cccccc;
  white-space: nowrap;
}

.ruler-tick-y {
  position: absolute;
  left: 0;
  height: 1px;
  width: 100%;
  background: #5a5a5a;
  z-index: 11;
  pointer-events: none;
}

.ruler-tick-y span {
  position: absolute;
  top: 3px;
  left: 3px;
  font-size: 10px;
  color: #cccccc;
  white-space: nowrap;
  transform: rotate(-90deg);
  transform-origin: left top;
}

.ruler-tick-y span {
  position: absolute;
  left: 2px;
  top: 0;
}

.selection-rect {
  position: absolute;
  border: 1px dashed #4fc3f7;
  background: rgba(79, 195, 247, 0.15);
  pointer-events: none;
  z-index: 100;
}

.grid-line-x {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: rgba(255, 255, 255, 0.06);
  pointer-events: none;
}

.grid-line-y {
  position: absolute;
  left: 0;
  right: 0;
  height: 1px;
  background: rgba(255, 255, 255, 0.06);
  pointer-events: none;
}

.widget {
  position: absolute;
  border-radius: 4px;
  border: 1px solid #666;
  /* 线框颜色调淡一些 */
  color: #fff;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2px 4px;
  -webkit-user-select: none;
  user-select: none;
  box-sizing: border-box;
  background: transparent;
  /* 默认无背景，具体颜色由 widgetVisualStyle 决定 */
}

/* 设置对话框样式 */
.settings-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.settings-dialog {
  background: #2d2d30;
  border: 1px solid #3e3e42;
  border-radius: 8px;
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

.close-btn {
  background: none;
  border: none;
  color: #cccccc;
  font-size: 24px;
  cursor: pointer;
  padding: 0;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
}

.close-btn:hover {
  background: #3e3e42;
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

.settings-footer button {
  padding: 6px 16px;
  font-size: 12px;
  border-radius: 4px;
  cursor: pointer;
}

.settings-footer button:first-child {
  background: #3e3e42;
  color: #cccccc;
  border: 1px solid #3e3e42;
}

.settings-footer button:first-child:hover {
  background: #4a4a4a;
}

.settings-footer button:last-child {
  background: #007acc;
  color: white;
  border: 1px solid #007acc;
}

.settings-footer button:last-child:hover {
  background: #005a9e;
}

.widget.selected {
  box-shadow: 0 0 0 2px #4fc3f7;
  border-color: #4fc3f7;
}

.resize-handle {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 10px;
  height: 10px;
  background: #4fc3f7;
  border-radius: 2px 0 0 0;
  cursor: se-resize;
}

.widget.input {
  justify-content: flex-start;
  padding-left: 8px;
}

.widget.checkbox {
  justify-content: flex-start;
  padding-left: 6px;
}

.widget.combobox {
  justify-content: flex-start;
  padding: 0 0 0 8px;
}

.checkbox-box {
  width: 14px;
  height: 14px;
  border: 1px solid #fff;
  margin-right: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
}

.combo-arrow {
  margin-left: auto;
  width: 18px;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  border-left: 1px solid rgba(255, 255, 255, 0.3);
  background: rgba(0, 0, 0, 0.15);
}

.empty-tip {
  font-size: 12px;
  color: #888;
}

.resources-panel {
  flex: 0 0 auto;
  /* 高度由内联 style 控制，可拖动调整 */
  border-top: 1px solid #333;
  background: #202225;
  padding: 6px 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  position: relative;
  /* 让悬浮预览相对整个资源面板定位 */
}

.resources-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: #ccc;
}

.resources-count {
  font-size: 11px;
  color: #888;
}

.resources-grid {
  flex: 1;
  overflow-x: auto;
  display: flex;
  gap: 8px;
  align-items: flex-start;
  transition: background-color 0.2s;
}

.resources-grid.drag-over {
  background-color: rgba(14, 99, 156, 0.2);
  border: 2px dashed #0e639c;
}

.resource-item {
  width: 96px;
  background: #2c2f33;
  border-radius: 4px;
  border: 1px solid #444;
  padding: 4px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.resource-item:hover {
  border-color: #4fc3f7;
}

.resource-thumb {
  width: 100%;
  height: 40px;
  /* 缩小预览高度 */
  background: #111;
  border-radius: 3px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.resource-thumb img {
  max-width: 100%;
  max-height: 100%;
  display: block;
}

.resource-placeholder {
  font-size: 11px;
  color: #777;
}

.resource-label {
  font-size: 11px;
  color: #ddd;
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
}

.resource-hover-preview {
  position: absolute;
  z-index: 20;
  background: #1e1e1e;
  border: 1px solid #555;
  border-radius: 4px;
  padding: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.6);
  pointer-events: none;
  /* 不抢占鼠标事件，避免触发 mouseleave 导致预览消失 */
  transform: translateY(-100%);
  /* 让预览窗整体出现在锚点（鼠标）上方 */
}

.resource-hover-preview img {
  max-width: 200px;
  max-height: 200px;
  display: block;
}

.resource-hover-label {
  margin-top: 2px;
  font-size: 11px;
  color: #ccc;
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
}
</style>
