# UI Designer Control Skill

## Purpose

让模板 Agent 通过 MCP 稳定控制 `ui-designer`，把自然语言需求转成可执行动作，并在导出前完成校验。

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

- 通过 `ui_get_audit_trail` 拉取最近动作日志。
- 建议按 `sessionId` 聚合，定位同一次需求执行链。
- 若使用运行态桥接，故障排查优先检查 `mcp-runtime` 队列目录是否有堆积请求。
