#!/usr/bin/env node
/**
 * 静态校验：Rust `mcp_http.rs` 中暴露的 Streamable HTTP 工具与审计字段（无需启动进程，供 CI 使用）。
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const verifyRustMcpSource = async () => {
  const p = path.resolve(process.cwd(), 'src-tauri/src/mcp_http.rs');
  const content = await fs.readFile(p, 'utf8');
  if (!content.includes('StreamableHttpService') || !content.includes('run_mcp_stack')) {
    throw new Error('mcp_http.rs must define Streamable HTTP MCP stack');
  }
  const requiredTools = [
    'ui_open_project',
    'ui_save_project',
    'ui_get_snapshot',
    'ui_apply_actions',
    'ui_export_code',
    'ui_export_structured_json',
    'ui_validate',
    'ui_get_audit_trail',
    'ui_get_transaction_audit_trail',
    'ui_runtime_call',
    'ui_runtime_transaction',
  ];
  for (const name of requiredTools) {
    const has = content.includes(`fn ${name}`) || content.includes(`async fn ${name}`);
    if (!has) {
      throw new Error(`missing tool in mcp_http.rs: ${name}`);
    }
  }
  const requiredFilters = ['session_id', 'action_id', 'action_type', 'transaction_id'];
  for (const f of requiredFilters) {
    if (!content.includes(f)) {
      throw new Error(`missing audit filter field in mcp_http.rs: ${f}`);
    }
  }
  console.log('Streamable MCP (Rust source) smoke: PASS');
};

verifyRustMcpSource().catch((err) => {
  console.error('Streamable MCP smoke: FAIL', err);
  process.exit(1);
});
