#!/usr/bin/env node
/**
 * 启动临时网关端口，验证 MCP Streamable HTTP 可 listTools（供本地/CI 快速断言）。
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const gatewayScript = path.join(__dirname, 'http-gateway.mjs');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const waitForHealth = async (port, timeoutMs = 8000) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      if (res.ok) return;
    } catch {
      /* retry */
    }
    await sleep(150);
  }
  throw new Error(`health check timeout on port ${port}`);
};

const main = async () => {
  const port = 18760 + Math.floor(Math.random() * 200);
  const child = spawn(process.execPath, [gatewayScript, '--port', String(port)], {
    stdio: 'ignore',
    windowsHide: true,
  });

  try {
    await waitForHealth(port);
    const base = `http://127.0.0.1:${port}`;
    // Cursor 等客户端常用「无路径」基础 URL，须与 /mcp 等价
    for (const href of [`${base}/`, `${base}/mcp`]) {
      const url = new URL(href);
      const transport = new StreamableHTTPClientTransport(url);
      const client = new Client({ name: 'streamable-smoke', version: '1.0.0' });
      await client.connect(transport);
      const { tools } = await client.listTools();
      const names = tools.map((t) => t.name).sort();
      const required = ['ui_validate', 'ui_get_snapshot', 'ui_open_project'];
      for (const name of required) {
        if (!names.includes(name)) {
          throw new Error(`missing tool ${name} at ${url}, got: ${names.join(', ')}`);
        }
      }
      await client.close();
    }
    console.log('Streamable HTTP MCP smoke: PASS', { port, toolCount: 'checked at / and /mcp' });
  } finally {
    child.kill();
    await sleep(200);
  }
};

main().catch((err) => {
  console.error('Streamable HTTP MCP smoke: FAIL', err);
  process.exit(1);
});
