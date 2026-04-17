#!/usr/bin/env node
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
