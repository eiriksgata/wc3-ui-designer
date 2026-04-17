#!/usr/bin/env node
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { ProjectEngine } from './project-engine.mjs';

const engine = new ProjectEngine();
const runtimeBridgeDir = path.resolve(process.cwd(), 'mcp-runtime');
const runtimeBridgeHttpUrl = process.env.UI_DESIGNER_RUNTIME_BRIDGE_URL || 'http://127.0.0.1:8766/call';
const portArgIndex = process.argv.findIndex((arg) => arg === '--port');
const port =
  portArgIndex >= 0 && process.argv[portArgIndex + 1]
    ? Number(process.argv[portArgIndex + 1])
    : Number(process.env.UI_DESIGNER_MCP_HTTP_PORT || 8765);

const protocol = {
  mode: 'http-gateway',
  mcpProtocolVersion: '1.0.0',
  pluginSchemaVersion: '1.0.0',
};

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

const callRuntimeBridgeFileQueue = async ({ method, params = {}, timeoutMs = 15000 }) => {
  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const requestPath = path.join(runtimeBridgeDir, `request_${requestId}.json`);
  const responsePath = path.join(runtimeBridgeDir, `response_${requestId}.json`);
  await fs.mkdir(runtimeBridgeDir, { recursive: true });
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
  if (!ok) throw new Error(`runtime bridge timeout: ${method}`);
  const raw = await fs.readFile(responsePath, 'utf8');
  await fs.unlink(responsePath).catch(() => {});
  const response = JSON.parse(raw);
  if (!response.ok) throw new Error(response.error || `runtime bridge failed: ${method}`);
  return response.data;
};

const callRuntimeBridgeHttp = async ({ method, params = {}, timeoutMs = 15000 }) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(runtimeBridgeHttpUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method, params, timeoutMs }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`runtime bridge http status=${response.status}`);
    const payload = await response.json();
    if (!payload?.ok) throw new Error(payload?.error || `runtime bridge http failed: ${method}`);
    return payload.data;
  } finally {
    clearTimeout(timer);
  }
};

const callRuntimeBridge = async ({ method, params = {}, timeoutMs = 15000 }) => {
  try {
    return await callRuntimeBridgeHttp({ method, params, timeoutMs });
  } catch {
    return await callRuntimeBridgeFileQueue({ method, params, timeoutMs });
  }
};

const ok = (data, diagnostics = []) => ({
  ok: diagnostics.length === 0,
  data,
  diagnostics,
  protocol,
});

const fail = (error) => ({
  ok: false,
  data: null,
  diagnostics: [String(error?.message || error)],
  protocol,
});

const createId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const handlers = {
  async ui_open_project({ projectPath }) {
    const snapshot = await engine.openProject(projectPath);
    return ok(snapshot, snapshot.diagnostics || []);
  },
  async ui_save_project({ projectPath }) {
    const result = await engine.saveProject(projectPath);
    return ok(result);
  },
  async ui_get_snapshot() {
    const snapshot = engine.getSnapshot();
    return ok(snapshot, snapshot.diagnostics || []);
  },
  async ui_apply_actions({ actions = [], dryRun, sessionId, allowDangerous }) {
    const result = engine.applyActions(actions, { dryRun: Boolean(dryRun), sessionId, allowDangerous });
    return ok(result, [...(result.errors || []), ...(result.warnings || [])]);
  },
  async ui_export_code({ outputPath, pluginId }) {
    const result = await engine.exportCode({ outputPath, pluginId });
    return ok(result);
  },
  async ui_export_structured_json() {
    const content = engine.exportStructuredJson();
    return ok({ content });
  },
  async ui_validate() {
    const result = engine.validate();
    return ok(result, result.diagnostics || []);
  },
  async ui_get_audit_trail({ limit = 100, sessionId, actionId, type }) {
    let events = engine.getAuditTrail(limit);
    if (sessionId) events = events.filter((event) => event.sessionId === sessionId);
    if (actionId) events = events.filter((event) => event.actionId === actionId);
    if (type) events = events.filter((event) => event.type === type);
    return ok({ events });
  },
  async ui_get_transaction_audit_trail({ limit = 100, transactionId }) {
    let events = engine.getTransactionAuditTrail(limit);
    if (transactionId) events = events.filter((event) => event.transactionId === transactionId);
    return ok({ events });
  },
  async ui_runtime_call({ method, params = {}, timeoutMs = 15000 }) {
    const data = await callRuntimeBridge({ method, params, timeoutMs });
    return ok({ method, data });
  },
  async ui_runtime_transaction({ actions = [], validateAfterApply = true, timeoutMs = 20000, transactionId }) {
    const txId = transactionId || createId('tx');
    const sessionId = createId(`session-${txId}`);
    const enrichedActions = actions.map((action, index) => ({
      ...action,
      actionId: action.actionId || action.idempotencyKey || createId(`action-${index + 1}`),
    }));
    engine.appendTransactionEvent({
      transactionId: txId,
      sessionId,
      phase: 'start',
      actionCount: enrichedActions.length,
    });
    const before = await callRuntimeBridge({ method: 'getProjectSnapshot', params: {}, timeoutMs });
    const applyResult = await callRuntimeBridge({
      method: 'batchApply',
      params: { actions: enrichedActions, sessionId },
      timeoutMs,
    });
    if (applyResult?.ok === false || (Array.isArray(applyResult?.errors) && applyResult.errors.length > 0)) {
      await callRuntimeBridge({ method: 'replaceProjectSnapshot', params: { snapshot: before }, timeoutMs });
      engine.appendTransactionEvent({
        transactionId: txId,
        sessionId,
        phase: 'rollback',
        reason: 'apply_failed',
      });
      return ok(
        {
          transactionId: txId,
          sessionId,
          actionIds: enrichedActions.map((action) => action.actionId),
          rolledBack: true,
          applyResult,
        },
        ['runtime transaction failed and rolled back'],
      );
    }
    let validateResult = null;
    if (validateAfterApply) {
      validateResult = await callRuntimeBridge({ method: 'validate', params: {}, timeoutMs });
      if (validateResult?.ok === false || (Array.isArray(validateResult?.diagnostics) && validateResult.diagnostics.length > 0)) {
        await callRuntimeBridge({ method: 'replaceProjectSnapshot', params: { snapshot: before }, timeoutMs });
        engine.appendTransactionEvent({
          transactionId: txId,
          sessionId,
          phase: 'rollback',
          reason: 'validate_failed',
        });
        return ok(
          {
            transactionId: txId,
            sessionId,
            actionIds: enrichedActions.map((action) => action.actionId),
            rolledBack: true,
            applyResult,
            validateResult,
          },
          ['runtime validation failed and rolled back'],
        );
      }
    }
    engine.appendTransactionEvent({
      transactionId: txId,
      sessionId,
      phase: 'commit',
    });
    return ok({
      transactionId: txId,
      sessionId,
      actionIds: enrichedActions.map((action) => action.actionId),
      rolledBack: false,
      applyResult,
      validateResult,
    });
  },
};

const readJsonBody = async (req) => {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 5 * 1024 * 1024) {
      throw new Error('request body too large');
    }
  }
  if (!body.trim()) return {};
  return JSON.parse(body);
};

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
      const payload = await readJsonBody(req);
      const tool = payload?.tool;
      const args = payload?.arguments || {};
      if (!tool || !handlers[tool]) {
        throw new Error(`unknown tool: ${tool || 'undefined'}`);
      }
      const result = await handlers[tool](args);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(result));
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
  console.log(`[ui-designer] MCP HTTP gateway listening on http://127.0.0.1:${port}`);
});
