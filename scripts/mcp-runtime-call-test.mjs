#!/usr/bin/env node
/**
 * MCP Streamable HTTP 调用探测：先测引擎快照，再测 ui_runtime_call(getProjectSnapshot)。
 * 用于区分「MCP 不通」「引擎可读」「运行态桥接超时」等路径。
 *
 * 用法（仓库根目录，且 Tauri 已跑、8765 可访问）：
 *   node ./scripts/mcp-runtime-call-test.mjs
 *
 * 环境变量：
 *   UI_DESIGNER_MCP_HTTP_URL  默认 http://127.0.0.1:8765
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const GATEWAY = process.env.UI_DESIGNER_MCP_HTTP_URL || 'http://127.0.0.1:8765';
const DEBUG_LOG = path.resolve(process.cwd(), 'debug-fba46a.log');
const SESSION = 'fba46a';
const INGEST = 'http://127.0.0.1:7635/ingest/2fd20395-f888-4ca3-81e3-5247a5f0bbb7';

/** @param {{ hypothesisId: string, message: string, data?: Record<string, unknown>, runId?: string }} p */
const agentLog = async (p) => {
  const line = JSON.stringify({
    sessionId: SESSION,
    runId: p.runId ?? 'mcp-runtime-test',
    hypothesisId: p.hypothesisId,
    location: 'scripts/mcp-runtime-call-test.mjs',
    message: p.message,
    data: p.data ?? {},
    timestamp: Date.now(),
  });
  await fs.appendFile(DEBUG_LOG, `${line}\n`, 'utf8').catch(() => {});
  await fetch(INGEST, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': SESSION },
    body: line,
  }).catch(() => {});
};

const main = async () => {
  // #region agent log
  await agentLog({
    hypothesisId: 'H0',
    message: 'script_start',
    data: { gateway: GATEWAY },
  });
  // #endregion

  let health;
  try {
    const hr = await fetch(`${GATEWAY.replace(/\/$/, '')}/health`);
    health = await hr.json();
  } catch (e) {
    // #region agent log
    await agentLog({
      hypothesisId: 'H3',
      message: 'health_fetch_failed',
      data: { error: String(e) },
    });
    // #endregion
    console.error('health 请求失败（MCP 未监听或地址错误）:', e);
    process.exit(1);
  }

  // #region agent log
  await agentLog({
    hypothesisId: 'H3',
    message: 'health_ok',
    data: { ok: health?.ok, mcp: health?.data?.mcp },
  });
  // #endregion

  if (!health?.ok) {
    console.error('health 非 ok', health);
    process.exit(1);
  }

  const base = new URL(GATEWAY.endsWith('/') ? GATEWAY : `${GATEWAY}/`);
  const transport = new StreamableHTTPClientTransport(base);
  const client = new Client({ name: 'mcp-runtime-call-test', version: '1.0.0' });
  await client.connect(transport);

  // #region agent log
  await agentLog({ hypothesisId: 'H1', message: 'mcp_client_connected', data: {} });
  // #endregion

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

  let snapRaw;
  try {
    snapRaw = await client.callTool({
      name: 'ui_get_snapshot',
      arguments: {},
    });
  } catch (e) {
    // #region agent log
    await agentLog({
      hypothesisId: 'H2',
      message: 'ui_get_snapshot_throw',
      data: { error: String(e) },
    });
    // #endregion
    console.error('ui_get_snapshot 异常', e);
    await client.close().catch(() => {});
    process.exit(1);
  }

  const snapParsed = parseToolJson(snapRaw);
  const widgetsLen = snapParsed?.data?.widgets?.length ?? snapParsed?.widgets?.length;

  // #region agent log
  await agentLog({
    hypothesisId: 'H2',
    message: 'ui_get_snapshot_done',
    data: {
      envelopeOk: snapParsed?.ok,
      widgetCount: typeof widgetsLen === 'number' ? widgetsLen : 'unknown',
    },
  });
  // #endregion

  console.log('[ui_get_snapshot] ok=', snapParsed?.ok, 'widgets.length=', widgetsLen);

  // #region agent log
  await agentLog({
    hypothesisId: 'H1',
    message: 'before_ui_runtime_call',
    data: { method: 'getProjectSnapshot', timeout_ms: 12000 },
  });
  // #endregion

  const t0 = Date.now();
  let rtRaw;
  let rtErr;
  try {
    rtRaw = await client.callTool({
      name: 'ui_runtime_call',
      arguments: {
        method: 'getProjectSnapshot',
        params: {},
        timeout_ms: 12000,
      },
    });
  } catch (e) {
    rtErr = e;
  }
  const elapsed = Date.now() - t0;

  if (rtErr) {
    const msg = String(rtErr?.message ?? rtErr);
    // #region agent log
    await agentLog({
      hypothesisId: 'H1',
      message: 'ui_runtime_call_throw',
      data: { elapsedMs: elapsed, error: msg.slice(0, 500) },
    });
    // #endregion
    console.error('[ui_runtime_call] 异常', rtErr);
    await client.close().catch(() => {});
    process.exit(1);
  }

  const rtParsed = parseToolJson(rtRaw);

  // #region agent log
  await agentLog({
    hypothesisId: 'H1',
    message: 'ui_runtime_call_done',
    data: {
      elapsedMs: elapsed,
      ok: rtParsed?.ok,
      hasData: rtParsed?.data != null,
      diagnosticsLen: Array.isArray(rtParsed?.diagnostics) ? rtParsed.diagnostics.length : 0,
    },
  });
  // #endregion

  console.log('[ui_runtime_call] elapsedMs=', elapsed, 'parsed=', JSON.stringify(rtParsed, null, 2).slice(0, 2000));

  await client.close().catch(() => {});

  // #region agent log
  await agentLog({ hypothesisId: 'H0', message: 'script_end', data: { exitCode: 0 } });
  // #endregion
};

main().catch(async (e) => {
  // #region agent log
  await agentLog({
    hypothesisId: 'H4',
    message: 'script_fatal',
    data: { error: String(e) },
  });
  // #endregion
  console.error(e);
  process.exit(1);
});
