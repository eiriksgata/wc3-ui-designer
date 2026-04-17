import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue';

type RuntimeActionApi = {
  batchApply?: (actions: any[]) => any;
  getProjectSnapshot?: () => any;
  replaceProjectSnapshot?: (snapshot: any) => any;
  validate?: () => any;
  exportWithPlugin?: (pluginId: string) => Promise<any> | any;
  exportStructuredJson?: () => Promise<any> | any;
  listExportPlugins?: () => any;
  undo?: () => any;
  redo?: () => any;
};

interface RuntimeBridgeOptions {
  api: RuntimeActionApi;
  message: Ref<string>;
  bridgeDir?: string;
}

const DEFAULT_BRIDGE_DIR = 'mcp-runtime';
const REQUEST_STALE_MS = 2 * 60 * 1000;
const RESPONSE_TTL_MS = 2 * 60 * 1000;

export function useMcpRuntimeBridge(options: RuntimeBridgeOptions) {
  const enabled = ref(false);
  const intervalId = ref<number | null>(null);
  const processing = ref(false);
  const bridgeDir = options.bridgeDir || DEFAULT_BRIDGE_DIR;

  const processRequest = async (request: any) => {
    const method = String(request?.method || '');
    const params = request?.params || {};
    const api = options.api;

    if (!method) {
      throw new Error('invalid runtime request: method is required');
    }

    if (method === 'batchApply') return api.batchApply?.(params.actions || []);
    if (method === 'getProjectSnapshot') return api.getProjectSnapshot?.();
    if (method === 'replaceProjectSnapshot') return api.replaceProjectSnapshot?.(params.snapshot);
    if (method === 'validate') return api.validate?.();
    if (method === 'exportWithPlugin') return api.exportWithPlugin?.(params.pluginId);
    if (method === 'exportStructuredJson') return api.exportStructuredJson?.();
    if (method === 'listExportPlugins') return api.listExportPlugins?.();
    if (method === 'undo') return api.undo?.();
    if (method === 'redo') return api.redo?.();

    throw new Error(`unsupported runtime method: ${method}`);
  };

  const setupBridgeDir = async () => {
    const fs = await import('@tauri-apps/plugin-fs');
    await fs.mkdir(bridgeDir, { recursive: true });
  };

  const consumeRequests = async () => {
    if (processing.value) return;
    processing.value = true;
    const fs = await import('@tauri-apps/plugin-fs');
    try {
      const entries = await fs.readDir(bridgeDir);
      const requestEntries = entries.filter((entry) => (entry.name || '').startsWith('request_') && (entry.name || '').endsWith('.json'));
      const responseEntries = entries.filter((entry) => (entry.name || '').startsWith('response_') && (entry.name || '').endsWith('.json'));

      for (const responseEntry of responseEntries) {
        try {
          const responsePath = `${bridgeDir}/${responseEntry.name}`;
          const responseRaw = await fs.readTextFile(responsePath);
          const response = JSON.parse(responseRaw);
          const ts = new Date(response?.handledAt || Date.now()).getTime();
          if (Date.now() - ts > RESPONSE_TTL_MS) {
            await fs.remove(responsePath);
          }
        } catch {
          // Ignore cleanup failures.
        }
      }

      for (const entry of requestEntries) {
        const requestPath = `${bridgeDir}/${entry.name}`;
        const requestRaw = await fs.readTextFile(requestPath);
        const request = JSON.parse(requestRaw);
        const createdAt = new Date(request?.createdAt || Date.now()).getTime();
        const requestId = request?.requestId || entry.name?.replace(/^request_/, '').replace(/\.json$/, '');
        const responsePath = `${bridgeDir}/response_${requestId}.json`;

        if (Date.now() - createdAt > REQUEST_STALE_MS) {
          await fs.writeTextFile(
            responsePath,
            JSON.stringify(
              {
                ok: false,
                requestId,
                data: null,
                error: 'runtime request expired before processing',
                handledAt: new Date().toISOString(),
              },
              null,
              2,
            ),
          );
          await fs.remove(requestPath);
          continue;
        }

        try {
          const data = await processRequest(request);
          await fs.writeTextFile(
            responsePath,
            JSON.stringify(
              {
                ok: true,
                requestId,
                data: data ?? null,
                error: null,
                handledAt: new Date().toISOString(),
              },
              null,
              2,
            ),
          );
        } catch (error: any) {
          await fs.writeTextFile(
            responsePath,
            JSON.stringify(
              {
                ok: false,
                requestId,
                data: null,
                error: String(error?.message || error),
                handledAt: new Date().toISOString(),
              },
              null,
              2,
            ),
          );
        } finally {
          await fs.remove(requestPath);
        }
      }
    } finally {
      processing.value = false;
    }
  };

  const start = async () => {
    try {
      await setupBridgeDir();
      enabled.value = true;
      options.message.value = 'MCP 运行态桥接已启用';
      intervalId.value = window.setInterval(async () => {
        if (!enabled.value) return;
        try {
          await consumeRequests();
        } catch {
          // bridge polling should be best-effort
        }
      }, 500);
    } catch {
      enabled.value = false;
    }
  };

  const stop = () => {
    enabled.value = false;
    if (intervalId.value != null) {
      window.clearInterval(intervalId.value);
      intervalId.value = null;
    }
  };

  onMounted(() => {
    start();
  });

  onBeforeUnmount(() => {
    stop();
  });

  return {
    enabled,
    start,
    stop,
  };
}
