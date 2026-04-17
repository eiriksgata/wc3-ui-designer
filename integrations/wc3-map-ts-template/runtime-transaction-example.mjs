#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const bridgeDir = path.resolve(process.cwd(), 'mcp-runtime');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const callRuntime = async (method, params = {}, timeoutMs = 15000) => {
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

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const raw = await fs.readFile(responsePath, 'utf8');
      await fs.unlink(responsePath).catch(() => {});
      const response = JSON.parse(raw);
      if (!response.ok) throw new Error(response.error || 'runtime call failed');
      return response.data;
    } catch (error) {
      if (error && /ENOENT/.test(String(error))) {
        await sleep(200);
        continue;
      }
      throw error;
    }
  }

  throw new Error(`runtime call timeout: ${method}`);
};

const runTransaction = async (actions) => {
  const transactionId = `template-tx-${Date.now()}`;
  const sessionId = `template-session-${Date.now()}`;
  const enrichedActions = actions.map((action, index) => ({
    ...action,
    actionId: action.actionId || `template-action-${index + 1}-${Date.now()}`,
  }));
  const before = await callRuntime('getProjectSnapshot');
  const apply = await callRuntime('batchApply', { actions: enrichedActions, sessionId });
  if (apply?.ok === false || (Array.isArray(apply?.errors) && apply.errors.length > 0)) {
    await callRuntime('replaceProjectSnapshot', { snapshot: before });
    return {
      ok: false,
      rolledBack: true,
      transactionId,
      sessionId,
      actionIds: enrichedActions.map((action) => action.actionId),
      reason: 'apply failed',
      apply,
    };
  }
  const validate = await callRuntime('validate');
  if (validate?.ok === false || (Array.isArray(validate?.diagnostics) && validate.diagnostics.length > 0)) {
    await callRuntime('replaceProjectSnapshot', { snapshot: before });
    return {
      ok: false,
      rolledBack: true,
      transactionId,
      sessionId,
      actionIds: enrichedActions.map((action) => action.actionId),
      reason: 'validate failed',
      validate,
    };
  }
  return {
    ok: true,
    rolledBack: false,
    transactionId,
    sessionId,
    actionIds: enrichedActions.map((action) => action.actionId),
    apply,
    validate,
  };
};

const main = async () => {
  const txResult = await runTransaction([
    {
      type: 'createWidget',
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
  ]);
  if (txResult.sessionId) {
    console.log(`Query actions: ui_get_audit_trail(sessionId="${txResult.sessionId}")`);
  }
  if (txResult.actionIds?.[0]) {
    console.log(`Query one action: ui_get_audit_trail(actionId="${txResult.actionIds[0]}")`);
  }
  console.log(JSON.stringify(txResult, null, 2));
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
