<template>
  <v-app>
    <div class="app-layout" :class="activeThemeName" :style="{ '--ui-zoom': uiZoom.toFixed(2) }">
    <div class="zoom-root">
      <!-- 顶部菜单栏：跨越整个窗口，包括左侧控件面板 -->
      <TopMenuBar :grid-snap-enabled="gridSnapEnabled" :message="message" :recent-projects="recentProjects"
        @new-project="handleNewProject" @open-project="loadProjectFromFile" @open-recent-project="openRecentProject"
        @save-project="saveProjectToFile" @save-as-project="saveProjectAsFile" @undo="undoLayout" @redo="redoLayout"
        @copy="copySelection" @paste="pasteClipboard" @delete-selected="deleteSelectedWithHistory"
        @clear-all="clearAllWithHistory" @align-left="alignLeft" @align-top="alignTop" @align-h-center="alignHCenter"
        @align-v-center="alignVCenter" @align-same-width="alignSameWidth" @align-same-height="alignSameHeight"
        @toggle-grid-snap="toggleGridSnap" @import-resources="onImportResourcesClick"
        @import-from-sidecar="importFromSidecar" @open-settings="showSettings = true"
        @open-export="showExportPanel = true" @open-help="showKeyboardShortcuts = true"
        @open-mcp-guide="showMcpUsageGuide = true" />

      <div class="main-row">
        <div class="left panel" :style="{ width: leftWidth + 'px', flex: `0 0 ${leftWidth}px` }" ref="leftPanelRef">
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
              <!-- 逻辑画布范围视觉提示（与外侧标尺区区分；不拦截鼠标） -->
              <div class="canvas-inner-hint" aria-hidden="true"></div>
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
                <template v-else-if="shouldRenderOwnText(w)">
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

        <PropertiesPanel :right-width="rightWidth" :canvas-width="settings.canvasWidth"
          :canvas-height="settings.canvasHeight" :selected-widget="selectedWidget" :selected-ids="selectedIds"
          :all-widget-types="allWidgetTypes" :parent-candidates="parentCandidates" :global-resources="globalResources"
          :property-tabs="propertyTabs" :active-property-tab="activePropertyTab"
          :current-widget-animations="currentWidgetAnimations" :expanded-animation-id="expandedAnimationId"
          :batch-move="batchMove" :batch-size="batchSize" :batch-text="batchText" :batch-image="batchImage"
          :base-type-of="baseTypeOf" :supports-image="supportsImage"
          @clamp-widgets="clampAllWidgets"
          @update:activePropertyTab="(v) => (activePropertyTab = v)" @update:batchText="(v) => (batchText = v)"
          @update:batchImage="(v) => (batchImage = v)" @toggleAnimationCard="toggleAnimationCard"
          @previewAnimation="previewAnimation" @duplicateAnimation="duplicateAnimation"
          @removeAnimation="removeAnimation" @addAnimationForSelected="addAnimationForSelected"
          @applyBatchMove="applyBatchMove" @applyBatchSize="applyBatchSize" @applyBatchText="applyBatchText"
          @applyBatchImage="applyBatchImage" />
      </div>

      <!-- 设置对话框 -->
      <SettingsDialog
        v-model:showSettings="showSettings"
        v-model:settings="settings"
        :theme-name="activeThemeName"
        @save="handleSaveSettings"
        @reset="handleResetSettings"
        @set-theme="setAppTheme"
        @change-global-resource-root="onGlobalRootChangeRequest"
      />

      <!-- 导出面板 -->
      <ExportPanel :show="showExportPanel" :ui-zoom="uiZoom" v-model:exportResourcesEnabled="exportResourcesEnabled"
        v-model:exportResourcesPath="exportResourcesPath" v-model:exportCodeEnabled="exportCodeEnabled"
        v-model:exportCodePath="exportCodePath" v-model:selectedExportPlugin="selectedExportPlugin"
        v-model:exportClassName="exportClassName" v-model:exportWriteSidecar="exportWriteSidecar"
        :export-plugins="exportPlugins" @close="showExportPanel = false"
        @select-export-resources-path="selectExportResourcesPath" @select-export-code-path="selectExportCodePath"
        @load-custom-plugin="loadCustomPlugin" @create-new-plugin="createNewPlugin" @edit-plugin="handleEditPlugin"
        @delete-plugin="handleDeletePlugin" @do-export="doExport" />


      <!-- 导出结果面板 -->
      <ExportResultDialog :show="showExportResultPanel" :messages="exportResultMessages"
        @close="showExportResultPanel = false" />

      <!-- Phase 4：AI 提案 - 确认门禁 -->
      <ProposalPanel :proposals="proposals.list.value" @accept="proposals.accept"
        @reject="(id) => proposals.reject(id)" />

      <!-- 底部资源管理器分隔条 -->
      <div v-if="!isResourcesCollapsed" class="h-resizer" @mousedown.prevent="startDragBottom"></div>

      <!-- 底部资源管理器（schema 2.0.0：单一全局库视图） -->
      <ResourcesPanel :height="resourcesHeight" :theme-name="activeThemeName" :collapsed="isResourcesCollapsed"
        :global-resources="globalResources"
        :global-resource-root-path="settings.globalResourceRootPath || ''"
        :global-root-configured="!!settings.globalResourceRootPath"
        :is-resources-drag-over="isResourcesDragOver" :hover-preview="hoverPreview" v-model:panelRef="resourcesPanelRef"
        v-model:gridRef="resourcesGridRef" @import-resources="onImportResourcesClick"
        @delete-from-global="onDeleteFromGlobal"
        @delete-folder-from-global="onDeleteFolderFromGlobal"
        @open-settings="showSettings = true"
        @apply-resource="applyResourceToSelection" @drag-enter="onResourcesDragEnter" @drag-over="onResourcesDragOver"
        @drag-leave="onResourcesDragLeave" @drop="onResourcesDrop" @drop-paths="onTauriDropPaths"
        @hover-enter="onResourceMouseEnter"
        @hover-move="onResourceMouseMove" @hover-leave="onResourceMouseLeave"
        @toggle-collapse="toggleResourcesCollapsed" />
      <!-- 隐藏的项目文件选择器（浏览器 / Tauri WebView 通用） -->
      <input ref="projectFileInput" type="file" accept=".uiproj,.json,application/json" style="display: none"
        @change="handleProjectFileSelected" />
      <!-- 初始/欢迎界面 -->
      <WelcomeScreen :show="showWelcome" :recent-projects="recentProjects" @new="handleWelcomeNew"
        @open="handleWelcomeOpen" @open-recent="openRecentProject" />
    </div> <!-- zoom-root -->

    <!-- 导出/插件等通用确认对话框 -->
    <v-dialog :model-value="showConfirmDialog" persistent width="460" scrim="rgba(9, 11, 15, 0.72)">
      <v-card class="confirm-card" rounded="xl" elevation="12">
        <v-card-title class="confirm-card-title">确认</v-card-title>
        <v-card-text class="confirm-card-message">{{ confirmDialogMessage }}</v-card-text>
        <v-card-actions class="confirm-card-actions">
          <v-btn variant="text" color="secondary" @click="confirmDialogCancel">取消</v-btn>
          <v-btn variant="flat" color="primary" @click="confirmDialogOk">确定</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

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
    <!-- MCP 使用说明对话框 -->
    <McpUsageDialog v-model:visible="showMcpUsageGuide" />

    <!-- 首次启动：引导用户配置全局资源库位置 -->
    <GlobalLibraryFirstRunDialog v-model:show="showGlrFirstRun"
      @picked="onGrlFirstRunPicked"
      @later="glrDeferredInSession = true" />

    <!-- 导入到全局资源库对话框 -->
    <ImportResourceDialog v-model:show="showImportToGlobalDialog"
      :initial-sources="importToGlobalSources"
      :initial-sub-dir="importToGlobalSubDir"
      :default-convert-to-blp="settings.defaultConvertToBlp"
      :root-path="settings.globalResourceRootPath"
      :warnings="importToGlobalWarnings"
      :busy="importToGlobalBusy"
      :progress="globalLibImportProgress"
      @confirm="onImportToGlobalConfirm"
      @update:show="onImportToGlobalDialogToggle" />

    <!-- 切换全局库路径时的迁移选择 -->
    <v-dialog v-model="showMigrateDialog" width="520" persistent scrim="rgba(9, 11, 15, 0.72)">
      <v-card class="confirm-card" rounded="xl" elevation="12">
        <v-card-title class="confirm-card-title">切换全局资源库路径</v-card-title>
        <v-card-text class="confirm-card-message">
          <div style="margin-bottom: 8px;">旧路径：<code>{{ migrateOldPath }}</code></div>
          <div style="margin-bottom: 12px;">新路径：<code>{{ migrateNewPath }}</code></div>
          <div>如何处理旧库中的资源？</div>
        </v-card-text>
        <v-card-actions class="confirm-card-actions" style="gap: 8px;">
          <v-btn variant="text" color="secondary" @click="onMigrateCancel" :disabled="migrateBusy">取消</v-btn>
          <v-btn variant="outlined" @click="onMigratePointerOnly" :disabled="migrateBusy">只切换指针</v-btn>
          <v-btn variant="flat" color="primary" @click="onMigrateMoveFiles"
            :loading="migrateBusy" :disabled="migrateBusy">迁移旧文件到新路径</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
    </div>
  </v-app>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, nextTick, onBeforeUnmount, watch } from 'vue';
import { confirm as tauriConfirm, open as tauriOpen, save as tauriSave } from '@tauri-apps/plugin-dialog';
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
import McpUsageDialog from './components/McpUsageDialog.vue';
import TopMenuBar from './components/TopMenuBar.vue';
import PropertiesPanel from './components/PropertiesPanel.vue';
import { activeThemeName, setAppTheme } from './plugins/vuetify';
import { useSettings } from './composables/useSettings';
import { useCanvas } from './composables/useCanvas';
import { useRuler } from './composables/useRuler';
import { useGrid } from './composables/useGrid';
import { useWidgets } from './composables/useWidgets';
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
import { useActionApi } from './composables/useActionApi';
import { useMcpRuntimeBridge } from './composables/useMcpRuntimeBridge';
import { useProposals } from './composables/useProposals';
import ProposalPanel from './components/ProposalPanel.vue';
import GlobalLibraryFirstRunDialog from './components/GlobalLibraryFirstRunDialog.vue';
import ImportResourceDialog from './components/ImportResourceDialog.vue';
import { useGlobalResourceLibrary } from './composables/useGlobalResourceLibrary';
import { getWidgetAlign } from './types';
import { UIBackgrounds } from './constants/templatePresets';

// 使用组合式函数
const { showSettings, settings, saveSettings, resetSettings, loadSettings } = useSettings();

// UI 缩放（需在 useCanvas 之前初始化，以便视口钳位与适配使用同一套逻辑坐标）
const uiZoomComposable = useUiZoom();
const {
  uiZoom,
  applyUiZoom,
  loadUiZoom,
} = uiZoomComposable;

// 快捷键帮助对话框显示状态
const showKeyboardShortcuts = ref(false);
const showMcpUsageGuide = ref(false);
const canvas = useCanvas(settings, uiZoom);
const { rulerStep, rulerXTicks, rulerYTicks } = useRuler(settings, canvas.canvasSize, canvas.canvasScale, canvas.panX, canvas.panY);
const { gridMode, gridSnapEnabled, gridStep, gridXTicks, gridYTicks, toggleGridSnap } = useGrid(settings);
const widgets = useWidgets(settings);

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
  clampCanvasPan,
  fitCanvasToView,
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
  clampAllWidgets,
  clearAll,
  deleteSelected,
} = widgets;

// 使用历史记录 composable（撤销/重做）
const history = useHistory(widgetsList, selectedIds, clampAllWidgets);
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


// 消息提示
const message = ref('');

// 欢迎界面显隐（默认关闭：启动后直接进入空白项目）
const showWelcome = ref(false);

// 使用最近项目列表 composable
const recentProjectsComposable = useRecentProjects();
const {
  recentProjects,
  loadRecentProjects,
  saveRecentProjects,
  addRecentProject,
} = recentProjectsComposable;

// 使用资源管理器 composable（需要在 message、selectedWidget 和 uiZoom 定义之后）
const resourceManager = useResourceManager(message, selectedWidget, uiZoom);
const {
  resourcesGridRef,
  resourcesPanelRef,
  isResourcesDragOver,
  hoverPreview,
  onResourcesDragEnter,
  onResourcesDragOver,
  onResourcesDragLeave,
  collectWebDropPaths,
  collectTauriDropPaths,
  pickImportPaths,
  applyResourceToSelection,
  onResourceMouseEnter,
  onResourceMouseMove,
  onResourceMouseLeave,
} = resourceManager;

/**
 * 统一的"开启导入对话框"助手：把一组待导入的绝对路径塞进 ImportResourceDialog。
 *
 * schema 2.0.0 起，**所有资源都经由全局库**。这里是所有导入入口的终点；
 * 项目不再维护自己的 imageResources 登记表——控件直接引用绝对路径即可。
 */
const openGlobalImportDialog = (
  paths: string[],
  subDir: string,
) => {
  if (!settings.value.globalResourceRootPath) {
    showGlrFirstRun.value = true;
    return;
  }
  if (!paths || !paths.length) return;
  importToGlobalSources.value = paths.slice();
  importToGlobalSubDir.value = subDir || '';
  importToGlobalWarnings.value = [];
  showImportToGlobalDialog.value = true;
};

// "导入资源…"按钮入口：先守卫全局库配置，再走全局库流水线，最后自动登记项目引用。
const onImportResourcesClick = async (opts?: { basePath?: string }) => {
  if (!settings.value.globalResourceRootPath) {
    showGlrFirstRun.value = true;
    return;
  }
  try {
    const paths = await pickImportPaths();
    if (!paths.length) return;
    openGlobalImportDialog(paths, opts?.basePath || '');
  } catch (e) {
    console.warn('选择资源失败', e);
  }
};

// 统一的 drop 调度：无论来源，都先落到全局库、再登记到项目。
const onResourcesDrop = async (
  ev: DragEvent,
  opts?: { basePath?: string },
) => {
  if (!settings.value.globalResourceRootPath) {
    showGlrFirstRun.value = true;
    return;
  }
  const paths = await collectWebDropPaths(ev);
  if (!paths.length) {
    message.value = '浏览器拖拽未获得路径，请改用 Tauri 原生拖放或"导入资源…"按钮';
    return;
  }
  openGlobalImportDialog(paths, opts?.basePath || '');
};

const onTauriDropPaths = async (
  paths: string[],
  opts?: { basePath?: string },
) => {
  if (!settings.value.globalResourceRootPath) {
    showGlrFirstRun.value = true;
    return;
  }
  const normalized = await collectTauriDropPaths(paths);
  if (!normalized.length) return;
  openGlobalImportDialog(normalized, opts?.basePath || '');
};

// ============================== 全局资源库 ==============================
// 注意：root 是 computed 的，所以 settings.globalResourceRootPath 变化会触发 refresh。
const globalLibRoot = computed(() => settings.value.globalResourceRootPath || '');
const globalLib = useGlobalResourceLibrary(globalLibRoot, message);
const {
  resources: globalResources,
  importSources: globalLibImport,
  removeEntry: globalLibRemove,
  migrate: globalLibMigrate,
  importProgress: globalLibImportProgress,
  resetImportProgress: globalLibResetImportProgress,
} = globalLib;

// ---- 首次引导 ----
const showGlrFirstRun = ref(false);
// 用户点"稍后再说"后，本会话不再自动弹
const glrDeferredInSession = ref(false);

const onGrlFirstRunPicked = (payload: { path: string; result?: { message: string } }) => {
  if (!payload.path) {
    if (payload.result) {
      message.value = payload.result.message;
    }
    return;
  }
  settings.value.globalResourceRootPath = payload.path;
  saveSettings();
  message.value = `全局资源库已设置：${payload.path}`;
};

// ---- 导入到全局库 ----
const showImportToGlobalDialog = ref(false);
const importToGlobalSources = ref<string[]>([]);
const importToGlobalSubDir = ref<string>('');
const importToGlobalWarnings = ref<{ source: string; message: string }[]>([]);
const importToGlobalBusy = ref(false);

const onImportToGlobalConfirm = async (payload: {
  sources: string[];
  subDir: string;
  convertToBlp: boolean;
  overwrite: boolean;
}) => {
  importToGlobalBusy.value = true;
  try {
    // schema 2.0.0：所有导入 = 只入全局库；widget 使用时直接以绝对路径引用，无登记表。
    const result = await globalLibImport({
      sources: payload.sources,
      subDir: payload.subDir,
      convertToBlp: payload.convertToBlp,
      overwrite: payload.overwrite,
    });
    importToGlobalWarnings.value = result.warnings || [];
    if (!result.warnings || result.warnings.length === 0) {
      showImportToGlobalDialog.value = false;
      globalLibResetImportProgress();
    }
    const n = result.entries?.length || 0;
    if (n > 0) message.value = `已导入 ${n} 项到全局资源库`;
  } finally {
    importToGlobalBusy.value = false;
  }
};

/** 对话框通过 ✕/取消关闭时——如果不是在忙就把进度清掉，避免下次打开看见残留。 */
const onImportToGlobalDialogToggle = (visible: boolean) => {
  if (visible) return;
  if (!importToGlobalBusy.value) {
    globalLibResetImportProgress();
  }
};

// ---- 从全局库删除（右键菜单）----
// 注意：schema 2.0.0 起改为**硬删除**——调用 `global_resource_delete` 会直接从磁盘移除，
// 不再挪去 .trash。UI 的确认文案也要相应更严重一些。
const onDeleteFromGlobal = async (res: { value: string; label: string; relPath?: string }) => {
  const ok = await tauriConfirm(`确定要从全局资源库彻底删除 "${res.label}" 吗？\n此操作会直接从磁盘删除文件，无法撤销。`, {
    title: '确认删除',
    kind: 'warning',
  });
  if (!ok) return;
  const key = (res as any).relPath || (res as any).globalRelPath || res.value;
  await globalLibRemove(key);
};

/**
 * 从全局库硬删除整个文件夹（右键菜单）。
 * folder.path 是相对全局库根的路径（反斜杠风格）。后端会递归移除整个目录。
 */
const onDeleteFolderFromGlobal = async (folder: { path: string; name: string; count: number }) => {
  if (!folder?.path) return;
  const msg = `确定要从全局资源库彻底删除文件夹 "${folder.name}" 吗？\n` +
    `该文件夹下共 ${folder.count} 个资源将被一并从磁盘删除，无法撤销。`;
  const ok = await tauriConfirm(msg, {
    title: '确认删除文件夹',
    kind: 'warning',
  });
  if (!ok) return;
  await globalLibRemove(folder.path);
};

// ---- 切换全局库路径：迁移对话框 ----
const showMigrateDialog = ref(false);
const migrateOldPath = ref('');
const migrateNewPath = ref('');
const migrateBusy = ref(false);

const onGlobalRootChangeRequest = (payload: { oldPath: string; newPath: string }) => {
  migrateOldPath.value = payload.oldPath;
  migrateNewPath.value = payload.newPath;
  showMigrateDialog.value = true;
};

const onMigrateCancel = () => {
  showMigrateDialog.value = false;
  // 回滚 settings 里已经改过的字段
  settings.value.globalResourceRootPath = migrateOldPath.value;
};

const onMigratePointerOnly = () => {
  settings.value.globalResourceRootPath = migrateNewPath.value;
  saveSettings();
  showMigrateDialog.value = false;
  message.value = '已切换全局库路径（旧文件保留原地，请自行处理）';
};

const onMigrateMoveFiles = async () => {
  migrateBusy.value = true;
  try {
    const result = await globalLibMigrate(migrateOldPath.value, migrateNewPath.value, 'move');
    settings.value.globalResourceRootPath = migrateNewPath.value;
    saveSettings();
    const warnCount = result.warnings?.length || 0;
    message.value = warnCount
      ? `已迁移 ${result.movedCount} 个文件，${warnCount} 项有告警`
      : `已迁移 ${result.movedCount} 个文件到新路径`;
  } finally {
    migrateBusy.value = false;
    showMigrateDialog.value = false;
  }
};

// 使用导出功能 composable
// 注意：saveProjectToFile 将在下面定义后传入
let saveProjectToFileForExport = null;
const exportComposable = useExport(
  widgetsList,
  settings,
  message,
  () => saveProjectToFileForExport && saveProjectToFileForExport(),
  getAnimationsForExport, // 传递动画导出函数给 useExport，用于插件导出
  globalResources,        // 全局库条目：导出时以此为"源地址权威表"
);
const {
  showExportPanel,
  showExportResultPanel,
  exportResultMessages,
  exportResourcesEnabled,
  exportResourcesPath,
  exportCodeEnabled,
  exportCodePath,
  exportClassName,
  exportWriteSidecar,
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
  { id: 'dialog', label: '对话框', baseType: 'panel' },
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
// schema 2.0.0：save/load 时 widget.image 做 abs<->rel 的转换，依赖全局库根。
const projectFile = useProjectFile(
  widgetsList,
  selectedIds,
  nextId,
  settings,
  animations,
  nextAnimIdAnim,
  exportResourcesEnabled,
  exportResourcesPath,
  exportCodeEnabled,
  exportCodePath,
  selectedExportPlugin,
  exportPlugins,
  pushHistory,
  addRecentProject,
  message,
  showWelcome,
  globalLibRoot,
);
const {
  projectFileInput,
  currentProjectPath,
  buildProjectJson,
  saveProjectToFile,
  saveProjectAsFile,
  openProjectFromPath,
  loadProjectFromFile,
  handleProjectFileSelected,
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
  clearHistory();
  clearCurrentProjectPath();
  resetExportConfig();
  message.value = '项目已关闭';
  showWelcome.value = false;
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
const isResourcesCollapsed = ref(false);
const lastExpandedResourcesHeight = ref(resourcesHeight.value);

const MIN_LEFT_WIDTH = 140;
const MAX_LEFT_WIDTH = 600;
const MIN_RIGHT_WIDTH = 180;
const MAX_RIGHT_WIDTH = 500;
const MIN_RESOURCES_HEIGHT = 120;
const MAX_RESOURCES_HEIGHT = 400;

const clampResourcesHeight = (h) => Math.min(MAX_RESOURCES_HEIGHT, Math.max(MIN_RESOURCES_HEIGHT, h));

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

const applyGlobalDragUX = (type) => {
  document.body.style.userSelect = 'none';
  document.body.style.cursor = type === 'bottom' ? 'row-resize' : 'col-resize';
};

const clearGlobalDragUX = () => {
  document.body.style.userSelect = '';
  document.body.style.cursor = '';
};

const startDragLeft = (ev) => {
  dragState.value = {
    type: 'left',
    startX: ev.clientX,
    startY: ev.clientY,
    leftWidth: leftWidth.value,
    rightWidth: rightWidth.value,
    resourcesHeight: resourcesHeight.value,
  };
  applyGlobalDragUX('left');
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
  applyGlobalDragUX('right');
  document.addEventListener('mousemove', handleDragMouseMove);
  document.addEventListener('mouseup', stopDrag);
};

const startDragBottom = (ev) => {
  if (isResourcesCollapsed.value) return;
  dragState.value = {
    type: 'bottom',
    startX: ev.clientX,
    startY: ev.clientY,
    leftWidth: leftWidth.value,
    rightWidth: rightWidth.value,
    resourcesHeight: resourcesHeight.value,
  };
  applyGlobalDragUX('bottom');
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
  } else if (s.type === 'right') {
    let w = s.rightWidth - dx; // 向左拖动增加右侧宽度
    w = Math.min(MAX_RIGHT_WIDTH, Math.max(MIN_RIGHT_WIDTH, w));
    rightWidth.value = w;
  } else if (s.type === 'bottom') {
    let h = s.resourcesHeight - dy; // 向上拖动增加高度
    h = clampResourcesHeight(h);
    resourcesHeight.value = h;
    if (!isResourcesCollapsed.value) {
      lastExpandedResourcesHeight.value = h;
    }
  }
};

const toggleResourcesCollapsed = () => {
  if (isResourcesCollapsed.value) {
    isResourcesCollapsed.value = false;
    resourcesHeight.value = clampResourcesHeight(lastExpandedResourcesHeight.value);
    return;
  }
  lastExpandedResourcesHeight.value = clampResourcesHeight(resourcesHeight.value);
  isResourcesCollapsed.value = true;
};

const stopDrag = () => {
  const finishedType = dragState.value.type;
  dragState.value.type = null;
  clearGlobalDragUX();
  document.removeEventListener('mousemove', handleDragMouseMove);
  document.removeEventListener('mouseup', stopDrag);
  if (finishedType === 'left') {
    settings.value.controlPanelWidth = leftWidth.value;
  }
  // 控制面板宽度拖动结束后保存到设置
  try {
    saveSettings();
  } catch (e) {
    console.warn('保存面板尺寸到设置失败', e);
  }
  requestAnimationFrame(() => {
    const el = canvasRef.value;
    if (el) {
      const rect = el.getBoundingClientRect();
      canvasSize.value = { width: rect.width, height: rect.height };
    }
    clampCanvasPan();
  });
};

// 层级树功能已移动到 useHierarchyTree composable

// 资源管理器相关逻辑已移动到 useResourceManager composable
// 撤销/重做功能已移动到 useHistory composable

// 使用剪贴板 composable
const clipboardComposable = useClipboard(selectedWidget, widgetsList, selectedIds, nextId, pushHistory, clampAllWidgets);
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

// 是否该控件有一个 Text 子节点来承载文字（按模板 Button 的组合语义：
// Button.ts 里的文字其实是内嵌的 Text 子框架渲染的）。
const hasTextChild = (w) => {
    if (!w) return false;
    const base = baseTypeOf(w.type);
    if (base !== 'button' && base !== 'panel') return false;
    return widgetsList.value.some(
        (c) => c.parentId === w.id && baseTypeOf(c.type) === 'text',
    );
};

// 该控件自身是否需要在画布上"画文字"。
// - text 类型：总是。
// - Button / Panel：仅当没有 Text 子节点时（老项目 / 未迁移的 legacy 兜底）。
const shouldRenderOwnText = (w) => {
    const base = baseTypeOf(w.type);
    if (base === 'text') return true;
    if (base === 'button' || base === 'panel') {
        return !hasTextChild(w) && typeof w.text === 'string' && w.text.length > 0;
    }
    // checkbox / combobox 等历史类型保持原有行为：在模板中单独渲染文字
    return true;
};

// alpha (0-255) → opacity (0-1)
const alphaToOpacity = (a) => {
    if (typeof a !== 'number' || isNaN(a)) return 1;
    return Math.max(0, Math.min(1, a / 255));
};

// 把 padding 对象折算成 CSS 字符串
const paddingToCss = (p) => {
    if (!p || typeof p !== 'object') return null;
    const t = Number(p.top) || 0;
    const r = Number(p.right) || 0;
    const b = Number(p.bottom) || 0;
    const l = Number(p.left) || 0;
    if (t === 0 && r === 0 && b === 0 && l === 0) return null;
    return `${t}px ${r}px ${b}px ${l}px`;
};

// 资源路径在不同链路里可能出现 `C:\\a\\b.png` / `C:/a/b.png` 两种写法，
// 这里统一成可比较的 key，避免仅因斜杠风格不同而匹配不到预览图。
const normalizeImagePathKey = (raw) => {
  if (!raw || typeof raw !== 'string') return '';
  const s = raw.trim().replace(/\\/g, '/');
  if (!s) return '';
  if (/^[A-Za-z]:\//.test(s) || s.startsWith('//')) return s.toLowerCase();
  return s;
};

const applyTextAlignStyle = (style, w) => {
    const { h, v } = getWidgetAlign(w);
    style.alignItems =
        v === 'top' ? 'flex-start' : v === 'bottom' ? 'flex-end' : 'center';
    style.justifyContent =
        h === 'left' ? 'flex-start' : h === 'right' ? 'flex-end' : 'center';
    if (typeof w.fontSize === 'number' && w.fontSize > 0) {
        style.fontSize = `${w.fontSize}px`;
    }
    if (typeof w.textColor === 'string' && /^[0-9A-Fa-f]{6}$/.test(w.textColor)) {
        style.color = `#${w.textColor}`;
    }
    // 描边预览：outlineSize 大于 0 时以 text-shadow 模拟，方便用户确认配置
    const outline = Number(w.outlineSize) || 0;
    if (outline > 0) {
        const s = Math.min(3, Math.max(1, Math.round(outline)));
        style.textShadow = `-${s}px -${s}px 0 #000, ${s}px -${s}px 0 #000, -${s}px ${s}px 0 #000, ${s}px ${s}px 0 #000`;
    } else {
        style.textShadow = 'none';
    }
};

const applyBackgroundStyle = (style, w) => {
    // 优先级：backgroundPreset > 资源图片 > 类型保底色
    const presetKey = typeof w.backgroundPreset === 'string' ? w.backgroundPreset : '';
    const presetValue = presetKey && UIBackgrounds[presetKey] != null ? UIBackgrounds[presetKey] : '';
    const imageValue = presetValue || w.image || '';
    // schema 2.0.0：widget.image 运行时 = 绝对路径。按 abs 去全局库里反查预览。
    const imageKey = normalizeImagePathKey(imageValue);
    const res = imageKey
      ? globalResources.value.find((r) => {
        const valueKey = normalizeImagePathKey(r.value);
        const localKey = normalizeImagePathKey(r.localPath);
        return valueKey === imageKey || localKey === imageKey;
      })
      : null;

    if (res && res.previewUrl) {
        style.backgroundImage = `url(${res.previewUrl})`;
        style.backgroundSize = '100% 100%';
        style.backgroundPosition = 'center center';
        style.backgroundRepeat = 'no-repeat';
        return;
    }

    const type = w.type;
    const base = baseTypeOf(type);
    if (base === 'button') {
        style.backgroundColor = '#2e7d32';
    } else if (type === 'label' || base === 'text') {
        style.backgroundColor = '#424242';
    } else if (type === 'input') {
        style.backgroundColor = '#212121';
    } else if (type === 'checkbox') {
        style.backgroundColor = '#37474f';
    } else if (type === 'combobox') {
        style.backgroundColor = '#283593';
    } else if (base === 'panel' || type === 'dialog') {
        style.backgroundColor = 'rgba(30,30,40,0.4)';
    } else {
        style.backgroundColor = 'rgba(255,255,255,0.04)';
    }
};

const widgetVisualStyle = (w) => {
    const style = {};

    applyBackgroundStyle(style, w);

    // 透明度（alpha 0-255 映射到 CSS opacity；undefined 时保留不透明）
    if (typeof w.alpha === 'number' && w.alpha >= 0 && w.alpha <= 255) {
        style.opacity = alphaToOpacity(w.alpha);
    }

    // 内边距：text / 自承载文字的 Button|Panel 才应用，避免 Panel 当纯容器时吃掉子控件可点区
    if (shouldRenderOwnText(w)) {
        const pad = paddingToCss(w.padding);
        style.padding = pad ?? '2px 4px';
        applyTextAlignStyle(style, w);
    } else {
        // 纯容器：不要 padding 也不要 align-items，避免内部 <span> 被强制布局
        style.padding = '0';
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
const alignment = useAlignment(widgetsList, selectedIds, pushHistory, message, settings);
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

const actionApi = useActionApi({
  widgetsList,
  selectedIds,
  nextId,
  animations,
  settings,
  addWidgetWithHistory,
  deleteSelectedWithHistory,
  clampAllWidgets,
  pushHistory,
  undoLayout,
  redoLayout,
  doExport,
  exportResultMessages,
  selectedExportPlugin,
  exportPlugins,
});

if (typeof window !== 'undefined') {
  (window as any).__uiDesignerActionApi = actionApi;
}

const proposals = useProposals(actionApi.batchApply);

useMcpRuntimeBridge({
  api: {
    ...actionApi,
    proposeActions: proposals.propose,
    getCurrentProjectPath: () => currentProjectPath.value,
  },
  message,
});

// 从 wc3-template-export 生成的 *.ui.json sidecar 反向导入（Phase 3）
async function importFromSidecar() {
  try {
    const { open: tauriOpen } = await import('@tauri-apps/plugin-dialog');
    const { readTextFile } = await import('@tauri-apps/plugin-fs');
    const selected = await tauriOpen({
      title: '选择 wc3-template-export 生成的 *.ui.json',
      multiple: false,
      filters: [
        { name: 'UI Sidecar', extensions: ['json'] },
        { name: '所有文件', extensions: ['*'] },
      ],
    });
    if (!selected) return;
    const filePath = Array.isArray(selected) ? selected[0] : selected;
    const raw = await readTextFile(filePath);
    const sidecar = JSON.parse(raw);
    if (sidecar?.generator !== 'wc3-template-export') {
      message.value = `sidecar generator 不匹配：${sidecar?.generator || '未知'}`;
      return;
    }
    if (!Array.isArray(sidecar?.widgets)) {
      message.value = 'sidecar 缺少 widgets 数组';
      return;
    }
    // sidecar 里 widget.image 是 `war3mapImported\<rel>`。
    // 新模型（schema 2.0.0）要求运行时持有绝对路径，所以这里反解成绝对路径。
    // 反解优先级：
    //   1. 从 sidecar.imageResources 里按 value 查 localPath；
    //   2. 兜底用当前全局库按 relPath 匹配。
    const WAR3_RE = /^war3mapImported[\\/]/i;
    const sidecarImgRes = Array.isArray(sidecar.imageResources) ? sidecar.imageResources : [];
    const byValue = new Map<string, string>();
    for (const r of sidecarImgRes) {
      if (r?.value && r?.localPath) byValue.set(String(r.value), String(r.localPath));
    }
    const byRel = new Map<string, string>();
    for (const g of globalResources.value || []) {
      if (g?.relPath && g?.value) {
        byRel.set(String(g.relPath).replace(/\//g, '\\').toLowerCase(), g.value);
      }
    }
    const IMG_FIELDS = ['image', 'clickImage', 'hoverImage'] as const;
    const resolvedWidgets = (sidecar.widgets as any[]).map((w) => {
      const next = { ...w };
      for (const f of IMG_FIELDS) {
        const v = next[f];
        if (typeof v !== 'string' || !v) continue;
        if (!WAR3_RE.test(v)) continue;
        const abs = byValue.get(v);
        if (abs) { next[f] = abs; continue; }
        const rel = v.replace(WAR3_RE, '').replace(/\//g, '\\').toLowerCase();
        const hit = byRel.get(rel);
        if (hit) next[f] = hit;
        // 找不到就保留原样，提示用户这张图不在当前全局库里
      }
      return next;
    });
    pushHistory();
    actionApi.replaceProjectSnapshot({
      widgets: resolvedWidgets,
      animations: (() => {
        const raw = sidecar.animations;
        if (!raw) return [];
        if (Array.isArray(raw)) return raw;
        const flat: any[] = [];
        let next = 1;
        for (const [wid, list] of Object.entries(raw)) {
          if (!Array.isArray(list)) continue;
          for (const a of list as any[]) {
            flat.push({ id: next++, widgetId: Number(wid) || 0, ...a });
          }
        }
        return flat;
      })(),
      settings: sidecar.settings || settings.value,
    });
    message.value = `已从 sidecar 导入 ${sidecar.widgets.length} 个控件：${filePath}`;
  } catch (e: any) {
    console.error('从 sidecar 导入失败', e);
    message.value = '从 sidecar 导入失败：' + (e?.message || e);
  }
}

// 使用批量编辑 composable（需在 supportsImage 与 settings 定义之后）
const batchEdit = useBatchEdit(widgetsList, selectedIds, pushHistory, moveWidgetWithChildren, supportsImage, settings);
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
  uiZoom,
  clampCanvasPan,
  settings,
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

  const handleResize = () => {
    updateCanvasSize();
    clampCanvasPan();
  };

  nextTick(() => {
    // 初始推入一份历史，用于撤销
    pushHistory();
    updateCanvasSize();
    requestAnimationFrame(() => {
      fitCanvasToView();
    });
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

  // 首次启动检查：若未配置全局资源库路径，弹引导对话框
  nextTick(() => {
    if (!settings.value.globalResourceRootPath && !glrDeferredInSession.value) {
      showGlrFirstRun.value = true;
    }
  });

  onBeforeUnmount(() => {
    window.removeEventListener('resize', handleResize);
    removeKeyboardListeners();
    document.removeEventListener('click', handleDocClick, true);
    document.removeEventListener('mousemove', handleDragMouseMove);
    document.removeEventListener('mouseup', stopDrag);
    clearGlobalDragUX();
  });
});

// 包装 handleResourcesSelected 以显示消息

</script>

<style>
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
  background: var(--panel-bg);
  font-size: 13px;
  position: relative;
  border-right: 1px solid var(--panel-border);
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.left > h3,
.left > .hint,
.left > .control-buttons {
  flex: 0 0 auto;
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
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.hierarchy-panel h4 {
  margin: 0 0 6px;
  font-size: 13px;
  flex: 0 0 auto;
}

.hierarchy-list {
  flex: 1 1 auto;
  min-height: 0;
  max-height: none;
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
  background: var(--panel-bg);
  border-right: none;
  border-left: 1px solid var(--panel-border);
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

.right {
  flex: 0 0 260px;
  /* 固定宽度，不参与压缩，避免被挤掉 */
  background: var(--panel-bg);
  border-right: none;
  border-left: 1px solid var(--panel-border);
}

.center {
  flex: 1 1 auto;
  min-width: 0;
  /* 允许中间区域在窗口变窄时收缩，保证右侧属性面板始终可见 */
  display: flex;
  flex-direction: column;
  background: var(--surface-bg);
}

.v-resizer {
  width: calc(10px / var(--ui-zoom, 1));
  min-width: 6px;
  flex: 0 0 auto;
  position: relative;
  z-index: 2;
  cursor: col-resize;
  background: linear-gradient(
    to right,
    transparent 0,
    transparent calc(50% - 1px),
    var(--panel-border) calc(50% - 1px),
    var(--panel-border) calc(50% + 1px),
    transparent calc(50% + 1px),
    transparent 100%
  );
  user-select: none;
  touch-action: none;
  transition: background 120ms ease, box-shadow 120ms ease;
}

.v-resizer:hover {
  background: linear-gradient(
    to right,
    transparent 0,
    transparent calc(50% - 1px),
    rgba(100, 162, 255, 0.9) calc(50% - 1px),
    rgba(100, 162, 255, 0.9) calc(50% + 1px),
    transparent calc(50% + 1px),
    transparent 100%
  );
  box-shadow: inset 0 0 0 1px rgba(100, 162, 255, 0.18);
}

.v-resizer:active {
  background: linear-gradient(
    to right,
    transparent 0,
    transparent calc(50% - 1px),
    rgba(100, 162, 255, 1) calc(50% - 1px),
    rgba(100, 162, 255, 1) calc(50% + 1px),
    transparent calc(50% + 1px),
    transparent 100%
  );
  box-shadow: inset 0 0 0 1px rgba(100, 162, 255, 0.28);
}

.h-resizer {
  height: calc(10px / var(--ui-zoom, 1));
  min-height: 6px;
  flex: 0 0 auto;
  position: relative;
  z-index: 2;
  cursor: row-resize;
  background: linear-gradient(
    to bottom,
    transparent 0,
    transparent calc(50% - 1px),
    var(--panel-border) calc(50% - 1px),
    var(--panel-border) calc(50% + 1px),
    transparent calc(50% + 1px),
    transparent 100%
  );
  user-select: none;
  touch-action: none;
  transition: background 120ms ease, box-shadow 120ms ease;
}

.h-resizer:hover {
  background: linear-gradient(
    to bottom,
    transparent 0,
    transparent calc(50% - 1px),
    rgba(100, 162, 255, 0.9) calc(50% - 1px),
    rgba(100, 162, 255, 0.9) calc(50% + 1px),
    transparent calc(50% + 1px),
    transparent 100%
  );
  box-shadow: inset 0 0 0 1px rgba(100, 162, 255, 0.18);
}

.h-resizer:active {
  background: linear-gradient(
    to bottom,
    transparent 0,
    transparent calc(50% - 1px),
    rgba(100, 162, 255, 1) calc(50% - 1px),
    rgba(100, 162, 255, 1) calc(50% + 1px),
    transparent calc(50% + 1px),
    transparent 100%
  );
  box-shadow: inset 0 0 0 1px rgba(100, 162, 255, 0.28);
}

.menubar-msg {
  margin-left: auto;
  font-size: 12px;
  color: var(--menu-msg-color);
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

.confirm-card {
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: linear-gradient(165deg, #2d3139 0%, #252831 100%);
}

.confirm-card-title {
  font-size: 18px;
  font-weight: 650;
  color: #f2f6ff;
  padding: 18px 20px 6px;
}

.confirm-card-message {
  color: #c5cfdf;
  font-size: 14px;
  line-height: 1.6;
  padding: 6px 20px 4px;
}

.confirm-card-actions {
  padding: 12px 16px 16px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
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
  z-index: 2000;
  display: inline-block;
  min-width: 176px;
  padding: 6px;
  border-radius: 10px;
  background: #2b2e34;
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow:
    0 4px 6px rgba(0, 0, 0, 0.25),
    0 12px 28px rgba(0, 0, 0, 0.35);
}

.context-menu hr {
  margin: 6px 4px;
  border: none;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
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

button:not(.v-btn) {
  font-size: 13px;
  padding: 6px 10px;
  margin: 3px 0;
  cursor: pointer;
  border-radius: 3px;
  border: 1px solid #555;
  background: #333;
  color: #eee;
}

button:not(.v-btn):hover {
  background: #444;
}

/* 右键菜单项：必须放在全局 button 规则之后，否则会继承粗边框与错位间距 */
.context-menu button:not(.v-btn) {
  display: block;
  width: 100%;
  box-sizing: border-box;
  margin: 0;
  padding: 8px 12px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #e8ecf4;
  font-size: 12px;
  font-weight: 450;
  line-height: 1.35;
  letter-spacing: 0.01em;
  text-align: left;
  cursor: pointer;
  transition: background 0.12s ease;
}

.context-menu button:not(.v-btn):hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.07);
}

.context-menu button:not(.v-btn):disabled {
  opacity: 0.38;
  cursor: not-allowed;
}

input[type='text']:not(.v-field__input),
input[type='number']:not(.v-field__input),
select:not(.v-field__input),
textarea:not(.v-field__input) {
  width: 100%;
  margin: 2px 0 6px;
  padding: 4px 6px;
  border-radius: 3px;
  border: 1px solid #555;
  background: #1e1e1e;
  color: #eee;
  font-size: 12px;
}

textarea:not(.v-field__input) {
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
  overflow: hidden;
  background: radial-gradient(circle at top left, #303030, #1a1a1a);
}

/* 与标尺外侧灰色区域区分：可放置控件的逻辑画布范围 */
.canvas-inner-hint {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
  pointer-events: none;
  box-sizing: border-box;
  border: 2px solid rgba(72, 190, 160, 0.55);
  background: linear-gradient(
    165deg,
    rgba(28, 85, 72, 0.2) 0%,
    rgba(18, 42, 38, 0.14) 45%,
    rgba(14, 32, 30, 0.1) 100%
  );
  box-shadow:
    inset 0 0 0 1px rgba(130, 230, 200, 0.12),
    inset 0 0 100px rgba(20, 70, 58, 0.06);
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
  z-index: 1;
}

.grid-line-y {
  position: absolute;
  left: 0;
  right: 0;
  height: 1px;
  background: rgba(255, 255, 255, 0.06);
  pointer-events: none;
  z-index: 1;
}

.widget {
  position: absolute;
  z-index: 2;
  border-radius: 4px;
  border: 1px solid #666;
  color: #fff;
  font-size: 12px;
  display: flex;
  /* align-items / justify-content / padding 不再强制居中；
     由 widgetVisualStyle() 根据 textAlignH/textAlignV/padding 逐控件决定，
     否则 Button 的文字永远被强行居中（见模板 Button.ts 的 Text.setAlignment）。 */
  -webkit-user-select: none;
  user-select: none;
  box-sizing: border-box;
  background: transparent;
}

/* 承载文字的控件（text / 无 Text 子节点的 Button-Panel）默认给一个保底对齐，
   避免没有 textAlignH/V 时文字塌到左上角。具体对齐仍以 widgetVisualStyle 为准。 */
.widget > span {
  display: inline-block;
  line-height: 1.2;
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

</style>
