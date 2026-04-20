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

const runCargoLibTests = () =>
  new Promise((resolve, reject) => {
    const manifest = path.resolve(process.cwd(), 'src-tauri/Cargo.toml');
    const child = spawn('cargo', ['test', '-p', 'app', '--lib', '--manifest-path', manifest], {
      stdio: 'inherit',
      cwd: process.cwd(),
    });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`cargo test failed, exit=${code}`));
    });
    child.on('error', reject);
  });

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

const main = async () => {
  const strictRuntime = process.argv.includes('--strict-runtime');
  const verdicts = [];

  await runCargoLibTests();
  verdicts.push({ check: 'cargo test -p app --lib', ok: true });

  await runNodeScript(path.resolve(process.cwd(), 'scripts/mcp-streamable-smoke.mjs'));
  verdicts.push({ check: 'scripts/mcp-streamable-smoke', ok: true });

  await verifyRuntimeExample();
  verdicts.push({ check: 'runtime transaction example', ok: true });

  if (strictRuntime) {
    console.warn(
      '[ci-smoke] --strict-runtime: 已移除基于文件队列的运行态探测；请在桌面端使用 Tauri + 事件桥接验证 ui_runtime_*。',
    );
    verdicts.push({ check: 'strict-runtime (skipped, file bridge removed)', ok: true, hostname: os.hostname() });
  }

  console.log('CI smoke verdict: PASS');
  console.log(JSON.stringify(verdicts, null, 2));
};

main().catch((error) => {
  console.error('CI smoke verdict: FAIL');
  console.error(error);
  process.exit(1);
});
