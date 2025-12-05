# 插件系统使用说明

## 概述

UI 设计器支持通过 TypeScript 插件来自定义导出格式。插件使用 TypeScript 编写，在浏览器中直接执行，支持多种输出格式（如 Lua、TypeScript、JASS 等）。

## 插件目录结构

```
plugins/
├── builtin/          # 内置插件（由系统提供）
└── custom/           # 自定义插件（用户创建）
```

## 创建自定义插件

### 1. 插件文件位置

将插件文件放在 `plugins/custom/` 目录下，文件扩展名必须是 `.ts`。

**注意**：由于浏览器安全限制，插件文件必须放在 `plugins/custom/` 目录才能被动态加载。如果通过"加载插件"功能选择其他位置的插件文件，系统会提示你将文件复制到该目录。

### 2. 插件接口

插件必须导出以下内容：

- `metadata`: 插件元数据对象
- `export`: 导出函数

#### 插件元数据 (metadata)

```typescript
{
    id: string;              // 插件唯一标识符
    name: string;            // 插件显示名称
    description?: string;    // 插件描述
    outputFormat: string;    // 输出格式（如 'lua', 'typescript', 'jass' 等）
    version?: string;        // 插件版本
    author?: string;         // 插件作者
    type: 'custom';          // 插件类型（自定义插件必须是 'custom'）
}
```

#### 导出函数 (export)

```typescript
function export(context: ExportContext): string {
    // 处理导出逻辑
    // 返回生成的代码字符串
    return generatedCode;
}
```

#### 导出上下文 (ExportContext)

```typescript
interface ExportContext {
    widgets: Widget[];                    // 控件列表
    imageResources: ImageResource[];      // 图片资源列表
    animations: Record<string, Animation[]>; // 动画数据（按控件 ID 分组）
    settings: {
        canvasWidth: number;
        canvasHeight: number;
    };
    options: {
        fileName?: string;        // 项目文件名（用于生成类名）
        resourcePath?: string;    // 资源导出路径
        codePath?: string;        // 代码导出路径
        [key: string]: any;       // 其他自定义选项
    };
}
```

### 3. 插件模板

参考 `plugins/example-plugin.ts` 文件，这是一个完整的示例插件。

### 4. 使用插件编辑器

1. 在导出面板中点击"新建插件"创建新插件
2. 或点击"编辑"修改现有插件
3. 插件编辑器提供了 TypeScript 代码编辑功能
4. 保存后，插件会被添加到插件列表中

## 内置插件

系统提供了以下内置插件：

- **Lua 导出插件** (`lua-export`): 将 UI 导出为 Lua 代码（Frame UI 框架格式）
- **TypeScript 导出插件** (`typescript-export`): 将 UI 导出为 TypeScript 代码（示例）

## 插件执行流程

1. 系统扫描 `plugins/builtin/` 和 `plugins/custom/` 目录
2. 使用动态 `import()` 加载插件模块
3. 验证插件格式（检查 metadata 和 export 函数）
4. 执行插件时，传入完整的 `ExportContext`
5. 插件返回生成的代码字符串
6. 系统将代码保存到指定文件

## 错误处理

如果插件执行失败，系统会显示详细的错误信息：

- 插件验证失败：检查 metadata 和 export 函数是否正确导出
- 执行错误：检查插件代码逻辑是否正确
- 类型错误：确保插件符合 TypeScript 类型定义

## 注意事项

1. **插件文件位置**：自定义插件必须放在 `plugins/custom/` 目录才能被加载
2. **TypeScript 支持**：插件使用 TypeScript 编写，支持完整的类型检查
3. **浏览器执行**：插件在浏览器中直接执行，无需编译
4. **输出格式**：插件可以输出任何格式的代码（Lua、TypeScript、JASS 等），只需在 `outputFormat` 中指定
5. **向后兼容**：旧项目中的 Lua 插件配置会自动迁移到新的插件系统

## 示例

查看 `plugins/example-plugin.ts` 了解完整的插件实现示例。
