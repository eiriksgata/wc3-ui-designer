#!/usr/bin/env node
/**
 * 同时启动 HTTP 网关（默认 8765）与运行态桥接 HTTP（默认 8766），供 Tauri 或仅需 HTTP 栈的场景使用。
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const node = process.execPath;

const children = [];
let shuttingDown = false;

const start = (scriptName) => {
  const child = spawn(node, [path.join(__dirname, scriptName)], {
    stdio: 'ignore',
    windowsHide: true,
  });
  children.push(child);
  return child;
};

const gateway = start('http-gateway.mjs');
const bridge = start('runtime-bridge-http.mjs');

const shutdown = (exitCode = 0) => {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const c of children) {
    try {
      c.kill();
    } catch {
      // ignore
    }
  }
  process.exit(exitCode);
};

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

const onChildExit = (code, signal) => {
  if (shuttingDown) return;
  shutdown(signal ? 1 : code ?? 1);
};

gateway.on('exit', (code, signal) => onChildExit(code, signal));
bridge.on('exit', (code, signal) => onChildExit(code, signal));
