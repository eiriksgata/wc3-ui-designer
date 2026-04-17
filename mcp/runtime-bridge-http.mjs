#!/usr/bin/env node
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';

const bridgeDir = path.resolve(process.cwd(), 'mcp-runtime');
const portArgIndex = process.argv.findIndex((arg) => arg === '--port');
const port =
  portArgIndex >= 0 && process.argv[portArgIndex + 1]
    ? Number(process.argv[portArgIndex + 1])
    : Number(process.env.UI_DESIGNER_RUNTIME_BRIDGE_HTTP_PORT || 8766);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForFile = async (filePath, timeoutMs = 15000) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      await sleep(200);
    }
  }
  return false;
};

const callRuntimeQueue = async ({ method, params = {}, timeoutMs = 15000 }) => {
  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const requestPath = path.join(bridgeDir, `request_${requestId}.json`);
  const responsePath = path.join(bridgeDir, `response_${requestId}.json`);
  await fs.mkdir(bridgeDir, { recursive: true });
  await fs.writeFile(
    requestPath,
    JSON.stringify(
      {
        requestId,
        method,
        params,
        createdAt: new Date().toISOString(),
      },
      null,
      2,
    ),
    'utf8',
  );
  const ok = await waitForFile(responsePath, timeoutMs);
  if (!ok) throw new Error(`runtime queue timeout: ${method}`);
  const raw = await fs.readFile(responsePath, 'utf8');
  await fs.unlink(responsePath).catch(() => {});
  const response = JSON.parse(raw);
  if (!response.ok) throw new Error(response.error || `runtime queue failed: ${method}`);
  return response.data;
};

const readJson = async (req) => {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 2 * 1024 * 1024) throw new Error('payload too large');
  }
  return body.trim() ? JSON.parse(body) : {};
};

const ok = (data) => ({ ok: true, data, error: null });
const fail = (error) => ({ ok: false, data: null, error: String(error?.message || error) });

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method === 'GET' && req.url === '/health') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(ok({ status: 'ok', port })));
    return;
  }

  if (req.method === 'POST' && req.url === '/call') {
    try {
      const payload = await readJson(req);
      const method = String(payload?.method || '');
      if (!method) throw new Error('method is required');
      const data = await callRuntimeQueue({
        method,
        params: payload?.params || {},
        timeoutMs: Number(payload?.timeoutMs || 15000),
      });
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(ok(data)));
      return;
    } catch (error) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(fail(error)));
      return;
    }
  }

  res.statusCode = 404;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(fail('not found')));
});

server.listen(port, '127.0.0.1', () => {
  console.log(`[ui-designer] Runtime bridge HTTP listening on http://127.0.0.1:${port}`);
});
