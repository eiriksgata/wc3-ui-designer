# UI 设计器

一个用于设计 Lua Frame UI 框架界面的可视化设计器。

## 项目结构

```
src/
├── components/          # Vue 组件
│   └── SettingsDialog.vue    # 设置对话框组件
├── composables/        # 组合式函数（Composables）
│   ├── useCanvas.js           # 画布相关功能（缩放、平移）
│   ├── useGrid.js              # 网格相关功能
│   ├── useLuaExport.js         # Lua 代码导出
│   ├── useResources.js         # 资源管理
│   ├── useRuler.js             # 标尺相关功能
│   ├── useSettings.js          # 设置管理
│   └── useWidgets.js           # 控件管理
├── utils/              # 工具函数
│   └── tgaDecoder.js           # TGA 图片解码
├── App.vue             # 主应用组件
├── main.js             # 应用入口
└── style.css           # 全局样式
```

## 功能模块说明

### Composables（组合式函数）

- **useSettings.js**: 管理应用设置（画布尺寸、标尺步长、网格步长等）
- **useCanvas.js**: 处理画布的缩放、平移等操作
- **useRuler.js**: 处理标尺的显示和刻度计算
- **useGrid.js**: 处理网格的显示和吸附功能
- **useWidgets.js**: 管理控件的增删改查、选择、拖动等
- **useResources.js**: 管理图片资源的导入和预览
- **useLuaExport.js**: 将设计的 UI 导出为 Lua 代码

### 工具函数

- **tgaDecoder.js**: 将 TGA 格式图片解码为浏览器可显示的格式

### 组件

- **SettingsDialog.vue**: 设置对话框，用于配置画布、标尺、网格等参数

## 使用方法

1. 安装依赖：`npm install`
2. 启动开发服务器：`npm run dev`
3. 构建生产版本：`npm run build`

## 快捷键

- **Ctrl + 滚轮**: 缩放画布
- **空格 + 拖动**: 平移画布
- **G**: 切换网格显示（128×128 → 64×64 → 关闭）

