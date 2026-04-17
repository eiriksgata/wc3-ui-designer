# wc3-map-ts-template Integration

## 目标

把 `ui-designer` 的结构化导出结果快速接入 `wc3-map-ts-template`，让模板 Agent 可以直接消费 UI 数据。

## 最小接入流程

1. 启动 UI Designer MCP Server
   - `yarn mcp:start`
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

## 运行态桥接（可选）

当 UI Designer 桌面应用正在运行时，可用 `ui_runtime_call` 直接驱动运行态 `ActionApi`：

- `ui_runtime_call(method=batchApply, params={ actions: [...] })`
- `ui_runtime_call(method=validate)`
- `ui_runtime_call(method=exportWithPlugin, params={ pluginId: "lua-export" })`

该桥接使用本地目录 `mcp-runtime` 作为请求/响应队列。

## 约束建议

- 先校验再导出。
- 导出文件进入模板仓库时保留来源信息（时间戳、projectName）。
- 建议把本目录脚本复制到模板仓库并纳入 CI。
- 每轮执行固定 `sessionId`，并把 `sessionId` 回写到流水线日志。
