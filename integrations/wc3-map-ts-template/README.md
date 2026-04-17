# wc3-map-ts-template Integration

## 目标

把 `ui-designer` 的结构化导出结果快速接入 `wc3-map-ts-template`，让模板 Agent 可以直接消费 UI 数据。

## 最小接入流程

1. 启动 UI Designer MCP Server
   - `yarn mcp:start`
   - 或 HTTP 模式：`yarn mcp:start:http`
2. 模板 Agent 调用：
   - `ui_open_project`
   - `ui_apply_actions`（先 `dryRun=true` 预演，再正式执行）
   - `ui_validate`
   - `ui_export_structured_json`
   - `ui_get_audit_trail`
3. 将结构化 JSON 落盘为 `tmp/ui-structured.json`
4. 在模板仓库执行桥接脚本：
   - `node <ui-designer>/integrations/wc3-map-ts-template/bridge.mjs tmp/ui-structured.json src/generated/ui-designer.ts`
5. 模板工程引用 `src/generated/ui-designer.ts` 进入后续代码生成链。

HTTP 模式调用示例：

```bash
curl -X POST "http://127.0.0.1:8765/call" ^
  -H "Content-Type: application/json" ^
  -d "{\"tool\":\"ui_get_snapshot\",\"arguments\":{}}"
```

## 运行态桥接（可选）

当 UI Designer 桌面应用正在运行时，可用 `ui_runtime_call` 直接驱动运行态 `ActionApi`：

- `ui_runtime_call(method=batchApply, params={ actions: [...] })`
- `ui_runtime_call(method=validate)`
- `ui_runtime_call(method=exportWithPlugin, params={ pluginId: "lua-export" })`

该桥接使用本地目录 `mcp-runtime` 作为请求/响应队列。

### VS Code MCP 配置（可复制）

如需在 `wc3-map-ts-template` 开发时让 Copilot 直接调用 UI Designer MCP，可使用以下配置：

```json
{
  "servers": {
    "ui-designer-local": {
      "type": "stdio",
      "command": "node",
      "args": [
        "D:/work/github/ui-designer/mcp/server.mjs"
      ]
    }
  }
}
```

建议把 `D:/work/github/ui-designer/mcp/server.mjs` 换成你机器上的绝对路径。

可直接参考示例脚本（事务+失败回滚）：

- `node integrations/wc3-map-ts-template/runtime-transaction-example.mjs`
- 事务执行后可调用 `ui_get_transaction_audit_trail` 按 `transactionId` 查询轨迹
- 动作排障可调用 `ui_get_audit_trail` 并传 `sessionId/actionId/type` 过滤
- 在流水线日志里同时记录 `transactionId`、`sessionId`、`actionIds`
- 可在 UI Designer 仓库运行 `yarn mcp:ci-smoke` 做协议与示例链路冒烟校验
- 若 CI 有运行中 UI 进程，可用 `yarn mcp:ci-smoke:strict-runtime` 做运行态探测

## 约束建议

- 先校验再导出。
- 导出文件进入模板仓库时保留来源信息（时间戳、projectName）。
- 建议把本目录脚本复制到模板仓库并纳入 CI。
- 每轮执行固定 `sessionId`，并把 `sessionId` 回写到流水线日志。
