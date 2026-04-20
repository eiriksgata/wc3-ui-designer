#!/usr/bin/env node
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const runNodeScript = (scriptPath) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath], {
      stdio: 'inherit',
      cwd: process.cwd(),
    });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`script failed: ${scriptPath}, exit=${code}`));
    });
    child.on('error', reject);
  });

const verifyGatewayContracts = async () => {
  const gatewayPath = path.resolve(process.cwd(), 'mcp/http-gateway.mjs');
  const content = await fs.readFile(gatewayPath, 'utf8');
  if (!content.includes('StreamableHTTPServerTransport')) {
    throw new Error('http-gateway must use StreamableHTTPServerTransport for /mcp');
  }
  const requiredTools = [
    'ui_runtime_transaction',
    'ui_get_transaction_audit_trail',
    'ui_get_audit_trail',
    'ui_runtime_call',
  ];
  for (const toolName of requiredTools) {
    const hasHandler =
      content.includes(`async ${toolName}(`) ||
      content.includes(`'${toolName}'`) ||
      content.includes(`"${toolName}"`);
    if (!hasHandler) {
      throw new Error(`missing MCP HTTP tool contract: ${toolName}`);
    }
  }

  const requiredFilters = ['sessionId', 'actionId', 'type'];
  for (const filterName of requiredFilters) {
    if (!content.includes(filterName)) {
      throw new Error(`missing audit filter field: ${filterName}`);
    }
  }
};

const verifyRuntimeExample = async () => {
  const examplePath = path.resolve(process.cwd(), 'integrations/wc3-map-ts-template/runtime-transaction-example.mjs');
  const content = await fs.readFile(examplePath, 'utf8');
  const requiredKeywords = ['transactionId', 'sessionId', 'actionIds', 'replaceProjectSnapshot'];
  for (const keyword of requiredKeywords) {
    if (!content.includes(keyword)) {
      throw new Error(`runtime transaction example missing keyword: ${keyword}`);
    }
  }
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const callRuntimeBridge = async ({ method, params = {}, timeoutMs = 4000 }) => {
  const bridgeDir = path.resolve(process.cwd(), 'mcp-runtime');
  const requestId = `ci-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const raw = await fs.readFile(responsePath, 'utf8');
      await fs.unlink(responsePath).catch(() => {});
      const response = JSON.parse(raw);
      if (!response.ok) throw new Error(response.error || `runtime call failed: ${method}`);
      return response.data;
    } catch (error) {
      if (String(error).includes('ENOENT')) {
        await sleep(200);
        continue;
      }
      throw error;
    }
  }
  throw new Error(`runtime bridge timeout for method: ${method}`);
};

const runStrictRuntimeProbe = async () => {
  const txTag = `ci-smoke-${Date.now()}`;
  const before = await callRuntimeBridge({ method: 'getProjectSnapshot', params: {} });
  const apply = await callRuntimeBridge({
    method: 'batchApply',
    params: {
      actions: [
        {
          type: 'createWidget',
          actionId: `${txTag}-action-1`,
          payload: {
            widgetType: 'button',
            overrides: {
              name: `ci_probe_${Date.now()}`,
              text: 'CI Probe',
              x: 128,
              y: 128,
            },
          },
        },
      ],
      sessionId: `${txTag}-session`,
    },
  });

  const validate = await callRuntimeBridge({ method: 'validate', params: {} });

  // Keep the runtime project clean after smoke check.
  await callRuntimeBridge({
    method: 'replaceProjectSnapshot',
    params: { snapshot: before },
  });

  if (apply?.ok === false || (Array.isArray(apply?.errors) && apply.errors.length > 0)) {
    throw new Error(`strict runtime apply failed: ${JSON.stringify(apply)}`);
  }
  if (validate?.ok === false || (Array.isArray(validate?.diagnostics) && validate.diagnostics.length > 0)) {
    throw new Error(`strict runtime validate failed: ${JSON.stringify(validate)}`);
  }
};

const main = async () => {
  const strictRuntime = process.argv.includes('--strict-runtime');
  const verdicts = [];

  await runNodeScript(path.resolve(process.cwd(), 'mcp/e2e-check.mjs'));
  verdicts.push({ check: 'mcp/e2e-check', ok: true });

  await runNodeScript(path.resolve(process.cwd(), 'mcp/streamable-smoke.mjs'));
  verdicts.push({ check: 'mcp/streamable-smoke', ok: true });

  await verifyGatewayContracts();
  verdicts.push({ check: 'mcp/http-gateway contracts', ok: true });

  await verifyRuntimeExample();
  verdicts.push({ check: 'runtime transaction example', ok: true });

  if (strictRuntime) {
    await runStrictRuntimeProbe();
    verdicts.push({ check: 'runtime bridge strict probe', ok: true, hostname: os.hostname() });
  }

  console.log('CI smoke verdict: PASS');
  console.log(JSON.stringify(verdicts, null, 2));
};

main().catch((error) => {
  console.error('CI smoke verdict: FAIL');
  console.error(error);
  process.exit(1);
});
