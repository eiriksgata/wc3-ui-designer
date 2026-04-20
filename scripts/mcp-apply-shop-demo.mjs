#!/usr/bin/env node
/**
 * 在「当前运行中的」ui-designer（Tauri + Rust MCP + 运行态事件桥接）里批量创建「道具商店」示例布局。
 *
 * 用法（仓库根目录）：
 *   node ./scripts/mcp-apply-shop-demo.mjs
 *
 * 前置：已 `yarn tauri:dev`（Rust MCP 默认 8765），且 MCP 可访问 http://127.0.0.1:8765/health
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const GATEWAY = process.env.UI_DESIGNER_MCP_HTTP_URL || 'http://127.0.0.1:8765';

/** 默认画布 800×600 下的布局；若你改了画布尺寸，可在设计器里再微调 */
const shopActions = () => {
  const tx = `shop-demo-${Date.now()}`;
  return [
    {
      type: 'createWidget',
      actionId: `${tx}-bg`,
      payload: {
        widgetType: 'panel',
        overrides: { name: 'shop_bg', x: 40, y: 40, w: 720, h: 520 },
      },
    },
    {
      type: 'createWidget',
      actionId: `${tx}-title`,
      payload: {
        widgetType: 'text',
        overrides: {
          name: 'shop_title',
          x: 64,
          y: 52,
          w: 420,
          h: 44,
          text: '道具商店',
          fontSize: 22,
          textAlign: 'top',
        },
      },
    },
    {
      type: 'createWidget',
      actionId: `${tx}-gold`,
      payload: {
        widgetType: 'text',
        overrides: {
          name: 'shop_balance',
          x: 480,
          y: 56,
          w: 256,
          h: 36,
          text: '金币：999',
          fontSize: 16,
          textAlign: 'top_right',
        },
      },
    },
    {
      type: 'createWidget',
      actionId: `${tx}-i1p`,
      payload: {
        widgetType: 'panel',
        overrides: { name: 'shop_item1_bg', x: 64, y: 130, w: 210, h: 280 },
      },
    },
    {
      type: 'createWidget',
      actionId: `${tx}-i1n`,
      payload: {
        widgetType: 'text',
        overrides: {
          name: 'shop_item1_name',
          x: 80,
          y: 148,
          w: 178,
          h: 40,
          text: '治疗药水',
          fontSize: 16,
          textAlign: 'top',
        },
      },
    },
    {
      type: 'createWidget',
      actionId: `${tx}-i1c`,
      payload: {
        widgetType: 'text',
        overrides: {
          name: 'shop_item1_price',
          x: 80,
          y: 220,
          w: 178,
          h: 32,
          text: '50 金币',
          fontSize: 14,
          textAlign: 'top_left',
        },
      },
    },
    {
      type: 'createWidget',
      actionId: `${tx}-i1b`,
      payload: {
        widgetType: 'button',
        overrides: { name: 'shop_item1_buy', x: 100, y: 330, w: 140, h: 44, text: '购买' },
      },
    },
    {
      type: 'createWidget',
      actionId: `${tx}-i2p`,
      payload: {
        widgetType: 'panel',
        overrides: { name: 'shop_item2_bg', x: 292, y: 130, w: 210, h: 280 },
      },
    },
    {
      type: 'createWidget',
      actionId: `${tx}-i2n`,
      payload: {
        widgetType: 'text',
        overrides: {
          name: 'shop_item2_name',
          x: 308,
          y: 148,
          w: 178,
          h: 40,
          text: '力量卷轴',
          fontSize: 16,
          textAlign: 'top',
        },
      },
    },
    {
      type: 'createWidget',
      actionId: `${tx}-i2c`,
      payload: {
        widgetType: 'text',
        overrides: {
          name: 'shop_item2_price',
          x: 308,
          y: 220,
          w: 178,
          h: 32,
          text: '120 金币',
          fontSize: 14,
          textAlign: 'top_left',
        },
      },
    },
    {
      type: 'createWidget',
      actionId: `${tx}-i2b`,
      payload: {
        widgetType: 'button',
        overrides: { name: 'shop_item2_buy', x: 328, y: 330, w: 140, h: 44, text: '购买' },
      },
    },
    {
      type: 'createWidget',
      actionId: `${tx}-i3p`,
      payload: {
        widgetType: 'panel',
        overrides: { name: 'shop_item3_bg', x: 520, y: 130, w: 210, h: 280 },
      },
    },
    {
      type: 'createWidget',
      actionId: `${tx}-i3n`,
      payload: {
        widgetType: 'text',
        overrides: {
          name: 'shop_item3_name',
          x: 536,
          y: 148,
          w: 178,
          h: 40,
          text: '回城卷轴',
          fontSize: 16,
          textAlign: 'top',
        },
      },
    },
    {
      type: 'createWidget',
      actionId: `${tx}-i3c`,
      payload: {
        widgetType: 'text',
        overrides: {
          name: 'shop_item3_price',
          x: 536,
          y: 220,
          w: 178,
          h: 32,
          text: '350 金币',
          fontSize: 14,
          textAlign: 'top_left',
        },
      },
    },
    {
      type: 'createWidget',
      actionId: `${tx}-i3b`,
      payload: {
        widgetType: 'button',
        overrides: { name: 'shop_item3_buy', x: 556, y: 330, w: 140, h: 44, text: '购买' },
      },
    },
    {
      type: 'createWidget',
      actionId: `${tx}-close`,
      payload: {
        widgetType: 'button',
        overrides: { name: 'shop_close', x: 320, y: 500, w: 160, h: 44, text: '关闭商店' },
      },
    },
  ];
};

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

const main = async () => {
  const health = await fetch(`${GATEWAY}/health`).then((r) => r.json());
  if (!health?.ok) {
    console.error('MCP 不可用，请先启动：yarn tauri:dev（Rust MCP 内嵌于桌面端）');
    process.exit(1);
  }

  const base = new URL(GATEWAY.endsWith('/') ? GATEWAY : `${GATEWAY}/`);
  const transport = new StreamableHTTPClientTransport(base);
  const client = new Client({ name: 'apply-shop-demo', version: '1.0.0' });
  await client.connect(transport);

  const raw = await client.callTool({
    name: 'ui_runtime_transaction',
    arguments: {
      actions: shopActions(),
      validateAfterApply: true,
      timeoutMs: 25000,
      transactionId: `shop-demo-${Date.now()}`,
    },
  });
  await client.close();

  const result = parseToolJson(raw);

  console.log(JSON.stringify(result, null, 2));

  const envelopeOk = result?.ok !== false && !(result?.diagnostics?.length > 0);
  if (!envelopeOk) {
    const msg = result?.diagnostics?.join?.('; ') || 'unknown';
    console.error('\n失败：', msg);
    console.error('\n若提示 runtime bridge timeout：请确认已用 yarn tauri:dev 打开桌面端（事件桥接，无文件队列）。');
    process.exit(1);
  }

  const data = result?.data;
  if (data?.rolledBack) {
    console.error('事务已回滚', data);
    process.exit(1);
  }

  console.log('\n已写入「道具商店」示例控件。可在画布上查看；transactionId:', data?.transactionId);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
