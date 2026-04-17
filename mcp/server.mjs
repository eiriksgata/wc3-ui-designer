#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { ProjectEngine } from './project-engine.mjs';

const engine = new ProjectEngine();
const runtimeBridgeDir = path.resolve(process.cwd(), 'mcp-runtime');

const protocolInfo = {
  mcpProtocolVersion: '1.0.0',
  pluginSchemaVersion: '1.0.0',
  server: 'ui-designer-mcp',
};

const normalizeError = (error) => ({
  ok: false,
  data: null,
  diagnostics: [String(error.message || error)],
  nextHints: ['检查参数与项目路径是否正确'],
});

const wrapData = (data, diagnostics = []) => ({
  ok: diagnostics.length === 0,
  data,
  diagnostics,
  nextHints: [],
  protocol: protocolInfo,
});

const waitForFile = async (filePath, timeoutMs = 15000) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  return false;
};

const callRuntimeBridge = async ({ method, params = {}, timeoutMs = 15000 }) => {
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
  if (!ok) {
    throw new Error(`runtime bridge timeout: ${method}`);
  }
  const raw = await fs.readFile(responsePath, 'utf8');
  await fs.unlink(responsePath).catch(() => {});
  const response = JSON.parse(raw);
  if (!response.ok) {
    throw new Error(response.error || `runtime bridge call failed: ${method}`);
  }
  return response.data;
};

const parseActionHints = (actions = []) => {
  const dangerous = actions.some((action) => action.type === 'clearProject' || action.type === 'deleteWidget');
  return { dangerous };
};

const server = new McpServer({
  name: 'ui-designer-mcp',
  version: '0.1.0',
});

server.tool(
  'ui_open_project',
  '打开并加载 .uiproj 项目',
  { projectPath: z.string().min(1) },
  async ({ projectPath }) => {
    try {
      const snapshot = await engine.openProject(projectPath);
      return {
        content: [{ type: 'text', text: JSON.stringify(wrapData(snapshot, snapshot.diagnostics), null, 2) }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: JSON.stringify(normalizeError(error), null, 2) }],
      };
    }
  },
);

server.tool(
  'ui_save_project',
  '保存当前项目到磁盘',
  { projectPath: z.string().optional() },
  async ({ projectPath }) => {
    try {
      const result = await engine.saveProject(projectPath);
      return { content: [{ type: 'text', text: JSON.stringify(wrapData(result), null, 2) }] };
    } catch (error) {
      return { content: [{ type: 'text', text: JSON.stringify(normalizeError(error), null, 2) }] };
    }
  },
);

server.tool(
  'ui_get_snapshot',
  '获取当前项目快照',
  {},
  async () => {
    try {
      const snapshot = engine.getSnapshot();
      return { content: [{ type: 'text', text: JSON.stringify(wrapData(snapshot, snapshot.diagnostics), null, 2) }] };
    } catch (error) {
      return { content: [{ type: 'text', text: JSON.stringify(normalizeError(error), null, 2) }] };
    }
  },
);

server.tool(
  'ui_apply_actions',
  '批量应用动作（create/update/delete/setParent）',
  {
    actions: z.array(z.record(z.any())),
    dryRun: z.boolean().optional(),
    sessionId: z.string().optional(),
    allowDangerous: z.boolean().optional(),
  },
  async ({ actions, dryRun, sessionId, allowDangerous }) => {
    try {
      const hints = parseActionHints(actions);
      if (dryRun) {
        const preview = engine.applyActions(actions, { dryRun: true, sessionId, allowDangerous });
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(wrapData({ ...preview, actionCount: actions.length, dangerous: hints.dangerous }, preview.errors), null, 2),
          }],
        };
      }
      const result = engine.applyActions(actions, { dryRun: false, sessionId, allowDangerous });
      const diagnostics = [...(result.errors || []), ...(result.warnings || [])];
      return { content: [{ type: 'text', text: JSON.stringify(wrapData(result, diagnostics), null, 2) }] };
    } catch (error) {
      return { content: [{ type: 'text', text: JSON.stringify(normalizeError(error), null, 2) }] };
    }
  },
);

server.tool(
  'ui_export_code',
  '导出代码/结构化数据到目标文件',
  {
    outputPath: z.string().min(1),
    pluginId: z.string().optional(),
  },
  async ({ outputPath, pluginId }) => {
    try {
      const result = await engine.exportCode({ outputPath, pluginId });
      return { content: [{ type: 'text', text: JSON.stringify(wrapData(result), null, 2) }] };
    } catch (error) {
      return { content: [{ type: 'text', text: JSON.stringify(normalizeError(error), null, 2) }] };
    }
  },
);

server.tool(
  'ui_export_structured_json',
  '返回结构化 JSON 字符串（不落盘）',
  {},
  async () => {
    try {
      const json = engine.exportStructuredJson();
      return { content: [{ type: 'text', text: JSON.stringify(wrapData({ content: json }), null, 2) }] };
    } catch (error) {
      return { content: [{ type: 'text', text: JSON.stringify(normalizeError(error), null, 2) }] };
    }
  },
);

server.tool(
  'ui_validate',
  '校验项目（重名资源、缺失资源等）',
  {},
  async () => {
    try {
      const result = engine.validate();
      return { content: [{ type: 'text', text: JSON.stringify(wrapData(result, result.diagnostics), null, 2) }] };
    } catch (error) {
      return { content: [{ type: 'text', text: JSON.stringify(normalizeError(error), null, 2) }] };
    }
  },
);

server.tool(
  'ui_get_audit_trail',
  '获取最近动作审计日志（sessionId/actionId）',
  {
    limit: z.number().int().min(1).max(500).optional(),
  },
  async ({ limit }) => {
    try {
      const data = engine.getAuditTrail(limit || 100);
      return { content: [{ type: 'text', text: JSON.stringify(wrapData({ events: data }), null, 2) }] };
    } catch (error) {
      return { content: [{ type: 'text', text: JSON.stringify(normalizeError(error), null, 2) }] };
    }
  },
);

server.tool(
  'ui_runtime_call',
  '调用运行中 UI 进程的 ActionApi（通过本地桥接队列）',
  {
    method: z.enum([
      'batchApply',
      'getProjectSnapshot',
      'validate',
      'exportWithPlugin',
      'exportStructuredJson',
      'listExportPlugins',
      'undo',
      'redo',
    ]),
    params: z.record(z.any()).optional(),
    timeoutMs: z.number().int().min(1000).max(120000).optional(),
  },
  async ({ method, params, timeoutMs }) => {
    try {
      const data = await callRuntimeBridge({ method, params: params || {}, timeoutMs: timeoutMs || 15000 });
      return { content: [{ type: 'text', text: JSON.stringify(wrapData({ method, data }), null, 2) }] };
    } catch (error) {
      return { content: [{ type: 'text', text: JSON.stringify(normalizeError(error), null, 2) }] };
    }
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
