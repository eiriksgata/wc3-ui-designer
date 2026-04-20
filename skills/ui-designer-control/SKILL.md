# UI Designer Control Skill

## Purpose

让模板 Agent 通过 MCP 稳定控制 `ui-designer`，把自然语言需求转成可执行动作，并在导出前完成校验。

连接方式：使用本地 **MCP Streamable HTTP**（`http://127.0.0.1:8765/mcp` 与根 **`http://127.0.0.1:8765/`** 等价，适配 Cursor）；服务端为 **Rust（rmcp）**，由 `yarn tauri:dev` 内嵌启动。

## 运行方式（硬性要求）

被自动化控制的 **ui-designer 进程必须是 Tauri 桌面端**，不要用仅浏览器的 `yarn dev` 作为 MCP 目标：Web 模式缺少或与桌面不一致的能力较多（原生文件/对话框、部分集成路径等），会导致工具调用「成功」但与真实使用场景不符。

- 启动：**`yarn tauri:dev`**（默认自动拉起内嵌 **Rust MCP** Streamable HTTP；若关闭自动启动，见仓库 `README.md` 中的 `UI_DESIGNER_AUTO_START_MCP`）。
- 不要向用户或脚本暗示「开浏览器开发者站即可等同完整功能」；完整流程校验一律以桌面端为准。

## Required Workflow

1. `ui_open_project`
2. `ui_apply_actions`（可多次）
3. `ui_validate`
4. `ui_export_structured_json`
5. `ui_export_code`
6. `ui_save_project`

运行态控制（可选，UI 进程已打开时）：

1. `ui_runtime_call(method=listExportPlugins)`
2. `ui_runtime_call(method=batchApply)`
3. `ui_runtime_call(method=validate)`
4. `ui_runtime_call(method=exportWithPlugin)`

运行态事务模式（推荐）：

1. `ui_runtime_transaction(actions=[...], transactionId="...")`
2. 事务内部自动执行：快照 -> 应用动作 -> 校验 -> 失败回滚
3. 通过 `ui_get_transaction_audit_trail(transactionId="...")` 回读事务轨迹
4. 读取返回中的 `sessionId` 与 `actionIds`，建立三层追踪链

## Action DSL

```json
{
  "actions": [
    {
      "type": "createWidget",
      "payload": {
        "widgetType": "button",
        "overrides": {
          "name": "btnStart",
          "x": 300,
          "y": 220,
          "w": 160,
          "h": 48,
          "text": "开始"
        }
      }
    },
    {
      "type": "updateWidgetProps",
      "targetId": 1,
      "payload": {
        "text": "开始游戏"
      }
    }
  ]
}
```

## Guardrails

- 必须先 `ui_validate`，再导出。
- 若 `diagnostics` 非空，优先修复后再 `ui_export_code`。
- 批量动作建议使用 `idempotencyKey`，避免重复执行。
- 高风险动作（例如大规模删除）先 dry-run（`ui_apply_actions` with `dryRun=true`）。
- 每一轮调用都要携带 `sessionId`，重要动作带 `actionId` 或 `idempotencyKey`。
- 若动作包含 `deleteWidget` 或 `clearProject`，默认不执行，除非显式 `allowDangerous=true`。

## Output Contract

所有工具响应都按以下结构解析：

```json
{
  "ok": true,
  "data": {},
  "diagnostics": [],
  "nextHints": [],
  "protocol": {
    "mcpProtocolVersion": "1.0.0",
    "pluginSchemaVersion": "1.0.0"
  }
}
```

## Recovery Strategy

- `ok=false`：读取 `diagnostics`，执行最小修复动作后重试。
- `missing image resources`：补齐资源或移除对应图片字段。
- `duplicate child name`：在同父节点下重命名冲突控件。
- 出现危险动作拦截时，先 `ui_apply_actions(dryRun=true)` 做影响评估，再决定是否放行。

## Observability

- 通过 `ui_get_audit_trail` 拉取最近动作日志（支持 `sessionId/actionId/type` 过滤）。
- 通过 `ui_get_transaction_audit_trail` 拉取事务级日志。
- 建议按 `transactionId -> sessionId -> actionIds` 关联日志。
- 若运行态调用超时，确认桌面端已启动且未阻塞主线程；桥接走 Tauri 事件，无文件队列。
