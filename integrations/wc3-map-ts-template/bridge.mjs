#!/usr/bin/env node
/**
 * @deprecated 请改用 codegen.mjs：
 *     node codegen.mjs <structured-json-path> --out-dir <src/ui/generated>
 * 本脚本保留是为了兼容旧 CI / 已有文档，只把 structured JSON 原样塞进一个
 * TypeScript 常量，不再参与新的闭环工作流。
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const ensureDir = async (dirPath) => {
  await fs.mkdir(dirPath, { recursive: true });
};

const renderUiBindingTs = (structuredJson) => {
  return `/**
 * Auto-generated from ui-designer MCP structured export.
 * Do not edit manually.
 */
export const uiDesignerPayload = ${JSON.stringify(structuredJson, null, 2)} as const;
`;
};

const main = async () => {
  console.warn(
    '[bridge.mjs] DEPRECATED — 请迁移到 codegen.mjs（支持 --out-dir / --check / sidecar）。',
  );
  const inputPath = process.argv[2];
  const outputPath = process.argv[3];

  if (!inputPath || !outputPath) {
    throw new Error('Usage: node bridge.mjs <structured-json-path> <output-ts-path>');
  }

  const raw = await fs.readFile(inputPath, 'utf8');
  const payload = JSON.parse(raw);
  const outputDir = path.dirname(outputPath);
  await ensureDir(outputDir);
  await fs.writeFile(outputPath, renderUiBindingTs(payload), 'utf8');
  console.log(`Generated: ${outputPath}`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
