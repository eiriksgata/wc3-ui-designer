# wc3-map-ts-template Integration

## 目标

把 `ui-designer` 的结构化导出结果快速接入 `wc3-map-ts-template`，让模板 Agent 可以直接消费 UI 数据。

## 最小接入流程

1. 启动 UI Designer（**Tauri 桌面**，内嵌 Rust MCP，默认 `http://127.0.0.1:8765`）  
   - `yarn tauri:dev`
2. 模板 Agent 通过 **MCP Streamable HTTP** 调用工具：
   - `ui_open_project`
   - `ui_apply_actions`（先 `dryRun=true` 预演，再正式执行）
   - `ui_validate`
   - `ui_export_structured_json`
   - `ui_get_audit_trail`
3. 将结构化 JSON 落盘为 `tmp/ui-structured.json`
4. 在模板仓库执行桥接脚本：
   - `node <ui-designer>/integrations/wc3-map-ts-template/bridge.mjs tmp/ui-structured.json src/generated/ui-designer.ts`
5. 模板工程引用 `src/generated/ui-designer.ts` 进入后续代码生成链。

> 浏览器-only 的 `yarn dev` **没有**完整 MCP + 运行态，自动化与 Agent 请以桌面端为准。

## 运行态桥接（可选）

当 UI Designer 桌面应用正在运行时，可用 `ui_runtime_call` / `ui_runtime_transaction` 驱动前端 `ActionApi`（经 **Tauri 事件**，无 Node 网关、无文件队列）。

- `ui_runtime_call(method=batchApply, params={ actions: [...] })`
- `ui_runtime_call(method=validate)`
- `ui_runtime_call(method=exportWithPlugin, params={ pluginId: "lua-export" })`

### VS Code MCP 配置（Streamable HTTP）

先在本机 `yarn tauri:dev`，再在 `mcp.json` 中使用：

```json
{
  "servers": {
    "uiDesigner": {
      "type": "http",
      "url": "http://127.0.0.1:8765/"
    }
  }
}
```

可直接参考示例脚本（通过 MCP `ui_runtime_transaction`，需桌面端已运行）：

- `node integrations/wc3-map-ts-template/runtime-transaction-example.mjs`
- 事务执行后可调用 `ui_get_transaction_audit_trail` 按 `transactionId` 查询轨迹
- 动作排障可调用 `ui_get_audit_trail` 并传过滤条件
- 在流水线日志里同时记录 `transactionId`、`sessionId`、`actionIds`
- 可在 UI Designer 仓库运行 `yarn mcp:ci-smoke` 做静态与 `cargo test` 检查

## 约束建议

- 先校验再导出。
- 导出文件进入模板仓库时保留来源信息（时间戳、projectName）。
- 建议把本目录脚本复制到模板仓库并纳入 CI。
- 每轮执行固定 `sessionId`，并把 `sessionId` 回写到流水线日志。
