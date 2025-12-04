# Tauri 使用指南

## 项目已配置完成 ✅

Tauri 已经成功初始化并配置完成！

## 开发模式

运行开发模式（会同时启动 Vite 开发服务器和 Tauri 窗口）：

```bash
npm run tauri:dev
```

或者：

```bash
npm run tauri dev
```

## 构建生产版本

构建可执行文件：

```bash
npm run tauri:build
```

或者：

```bash
npm run tauri build
```

## 输出位置

构建完成后，可执行文件位于：

- **Windows**: `src-tauri/target/release/UI设计器.exe`（约 10-30MB）
- **安装包**: `src-tauri/target/release/bundle/msi/UI设计器_0.1.0_x64_en-US.msi`

## 配置说明

### 窗口配置 (`src-tauri/tauri.conf.json`)
- 窗口标题：UI设计器
- 初始大小：1600x900
- 最小尺寸：800x600
- 可调整大小：是

### 权限配置 (`src-tauri/capabilities/default.json`)
已启用以下权限：
- ✅ 文件系统读写（导入资源文件夹、保存布局）
- ✅ 对话框（打开/保存文件）

### 构建优化 (`src-tauri/Cargo.toml`)
已启用以下优化以减小体积：
- `strip = true` - 移除调试符号
- `lto = true` - 链接时优化
- `codegen-units = 1` - 更好的优化
- `panic = "abort"` - 减小二进制大小

## 常见问题

### 1. 构建失败
如果遇到构建错误，尝试：
```bash
cd src-tauri
cargo clean
cd ..
npm run tauri:build
```

### 2. 开发模式无法启动
确保端口 5173 没有被占用，或者修改 `tauri.conf.json` 中的 `devUrl`。

### 3. 文件权限问题
如果需要更多文件系统权限，编辑 `src-tauri/capabilities/default.json`。

## 下一步

1. 测试开发模式：`npm run tauri:dev`
2. 构建生产版本：`npm run tauri:build`
3. 测试生成的 exe 文件

## 体积优化建议

如果生成的 exe 仍然较大，可以：
1. 使用 UPX 压缩（可选）
2. 移除不需要的 Tauri 插件
3. 确保使用了 release 模式构建

