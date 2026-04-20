#!/usr/bin/env node
/**
 * 通过 MCP Streamable HTTP 调用 `ui_runtime_transaction`（与桌面端 Tauri 事件桥接配合）。
 * 语义关键词（供 CI 校验）：transactionId、sessionId、actionIds、replaceProjectSnapshot（失败回滚由工具在 Rust 侧调用 replaceProjectSnapshot）。
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const GATEWAY = process.env.UI_DESIGNER_MCP_HTTP_URL || 'http://127.0.0.1:8765';

const parseToolJson = (result) => {
  const text = (result?.content || [])
    .map((c) => (c?.type === 'text' ? c.text : ''))
    .join('')
    .trim();
  if (!text) return result;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text, result };
  }
};

const main = async () => {
  const health = await fetch(`${GATEWAY}/health`).then((r) => r.json());
  if (!health?.ok) {
    console.error('请先 yarn tauri:dev 启动桌面端');
    process.exit(1);
  }

  const base = new URL(GATEWAY.endsWith('/') ? GATEWAY : `${GATEWAY}/`);
  const transport = new StreamableHTTPClientTransport(base);
  const client = new Client({ name: 'wc3-template-runtime-example', version: '1.0.0' });
  await client.connect(transport);

  const transactionId = `template-tx-${Date.now()}`;
  const raw = await client.callTool({
    name: 'ui_runtime_transaction',
    arguments: {
      actions: [
        {
          type: 'createWidget',
          actionId: `template-action-${Date.now()}`,
          payload: {
            widgetType: 'button',
            overrides: {
              name: 'btnRuntimeStart',
              text: '运行态开始',
              x: 360,
              y: 260,
              w: 180,
              h: 48,
            },
          },
        },
      ],
      validateAfterApply: true,
      timeoutMs: 20000,
      transactionId,
    },
  });
  await client.close();

  const result = parseToolJson(raw);
  const data = result?.data;
  const sessionId = data?.sessionId;
  const actionIds = data?.actionIds;

  if (sessionId) {
    console.log(`Query actions: ui_get_audit_trail(sessionId="${sessionId}")`);
  }
  if (actionIds?.[0]) {
    console.log(`Query one action: ui_get_audit_trail(actionId="${actionIds[0]}")`);
  }
  console.log(JSON.stringify(result, null, 2));
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
