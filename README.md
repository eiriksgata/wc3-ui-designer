# UI 设计器

该项目是在原有项目[ui-designer](https://gitee.com/dusheng990327/ui-designer)进行的部分代码重写，如果追求功能，建议使用原项目

一个用于设计 魔兽争霸 3 Frame UI 框架界面的可视化设计器。

## 项目结构

```
src/
├── components/          # Vue 组件
│   ├── CloseProjectDialog.vue      # 关闭项目确认对话框
│   ├── ExportPanel.vue             # 导出面板
│   ├── ExportResultDialog.vue      # 导出结果对话框
│   ├── KeyboardShortcutsDialog.vue # 快捷键帮助对话框
│   ├── LuaDebugDialog.vue          # Lua 调试输出对话框
│   ├── PluginEditorDialog.vue      # 插件编辑器对话框
│   ├── PropertiesPanel.vue         # 属性面板
│   ├── ResourcesPanel.vue          # 资源面板
│   ├── SettingsDialog.vue          # 设置对话框
│   ├── TopMenuBar.vue              # 顶部菜单栏
│   └── WelcomeScreen.vue           # 欢迎界面
├── composables/        # 组合式函数（Composables）
│   ├── useAlignment.ts             # 对齐功能
│   ├── useAnimations.ts            # 动画管理
│   ├── useBatchEdit.ts             # 批量编辑
│   ├── useCanvas.ts                # 画布相关功能（缩放、平移）
│   ├── useCanvasInteraction.ts    # 画布交互
│   ├── useClipboard.ts             # 剪贴板操作
│   ├── useContextMenu.ts          # 右键菜单
│   ├── useExport.ts                # 导出功能
│   ├── useGrid.ts                  # 网格相关功能
│   ├── useHierarchyTree.ts         # 层级树
│   ├── useHistory.ts               # 历史记录（撤销/重做）
│   ├── useKeyboard.ts              # 键盘快捷键
│   ├── useLuaExport.ts             # Lua 代码导出
│   ├── usePanelResize.ts           # 面板调整大小
│   ├── useProjectFile.ts           # 项目文件操作
│   ├── useRecentProjects.ts        # 最近项目
│   ├── useResourceManager.ts       # 资源管理器
│   ├── useResources.ts             # 资源管理
│   ├── useRuler.ts                 # 标尺相关功能
│   ├── useSettings.ts              # 设置管理
│   ├── useUiZoom.ts                # UI 缩放
│   └── useWidgets.ts               # 控件管理
├── types/              # TypeScript 类型定义
│   └── index.ts                    # 类型定义
├── utils/              # 工具函数
│   └── tgaDecoder.ts               # TGA 图片解码
├── App.vue             # 主应用组件
├── main.ts             # 应用入口（TypeScript）
└── style.css           # 全局样式
```

## 功能模块说明

### Composables（组合式函数）

- **useSettings.ts**: 管理应用设置（画布尺寸、标尺步长、网格步长等）
- **useCanvas.ts**: 处理画布的缩放、平移等操作
- **useCanvasInteraction.ts**: 处理画布的鼠标交互（拖动、选择等）
- **useRuler.ts**: 处理标尺的显示和刻度计算
- **useGrid.ts**: 处理网格的显示和吸附功能
- **useWidgets.ts**: 管理控件的增删改查、选择、拖动等
- **useResources.ts**: 管理图片资源的导入和预览
- **useResourceManager.ts**: 资源管理器（拖拽导入、预览等）
- **useLuaExport.ts**: 将设计的 UI 导出为 Lua 代码
- **useExport.ts**: 导出功能（Lua、资源、插件等）
- **useHistory.ts**: 历史记录管理（撤销/重做）
- **useKeyboard.ts**: 键盘快捷键处理
- **useClipboard.ts**: 剪贴板操作（复制/粘贴）
- **useAlignment.ts**: 对齐功能
- **useAnimations.ts**: 动画管理
- **useProjectFile.ts**: 项目文件操作（保存/加载）
- **useHierarchyTree.ts**: 层级树管理

### 工具函数

- **tgaDecoder.ts**: 将 TGA 格式图片解码为浏览器可显示的格式

### 组件

- **SettingsDialog.vue**: 设置对话框，用于配置画布、标尺、网格等参数
- **TopMenuBar.vue**: 顶部菜单栏
- **PropertiesPanel.vue**: 属性面板，用于编辑选中控件的属性
- **ResourcesPanel.vue**: 资源面板，显示和管理图片资源
- **ExportPanel.vue**: 导出面板，配置导出选项
- **KeyboardShortcutsDialog.vue**: 快捷键帮助对话框
- **WelcomeScreen.vue**: 欢迎界面

## 使用方法

### 前置要求

- **Node.js**: 建议使用 Node.js 18 或更高版本
- **Yarn**: 包管理器（项目使用 Yarn 而非 npm）
- **Rust**: 如果使用 Tauri 桌面应用功能，需要安装 Rust 工具链

### 安装依赖

```bash
yarn install
```

### 开发模式

启动网页开发服务器：

```bash
yarn dev
```

启动 Tauri 桌面应用开发模式（需要 Rust）：

```bash
yarn tauri:dev
```

### 构建

构建网页版本：

```bash
yarn build
```

构建 Tauri 桌面应用（需要 Rust）：

```bash
yarn tauri:build
```

### 类型检查

运行 TypeScript 类型检查：

```bash
yarn type-check
```

## 快捷键

### 文件操作

- **Ctrl + N**: 新建项目
- **Ctrl + O**: 打开项目
- **Ctrl + S**: 保存项目
- **Ctrl + Shift + S**: 另存为
- **Ctrl + W**: 关闭项目

### 编辑操作

- **Ctrl + Z**: 撤销
- **Ctrl + Y**: 重做
- **Ctrl + C**: 复制
- **Ctrl + V**: 粘贴
- **Del / Backspace**: 删除选中

### 画布操作

- **空格 + 拖动**: 平移画布
- **Ctrl + 滚轮**: 缩放画布
- **G**: 切换网格显示（128×128 → 64×64 → 关闭）

### 界面操作

- **Ctrl + +**: 放大界面
- **Ctrl + -**: 缩小界面

### 导出操作

- **F4**: 执行导出

> 提示：点击菜单栏的"帮助"按钮可以查看完整的快捷键列表。

## 技术栈

- **Vue 3**: 前端框架（Composition API）
- **TypeScript**: 类型系统
- **Vite**: 构建工具
- **Tauri**: 桌面应用框架（可选）
- **Yarn**: 包管理器
