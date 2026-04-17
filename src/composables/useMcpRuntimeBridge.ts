import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue';

type RuntimeActionApi = {
  batchApply?: (actions: any[]) => any;
  getProjectSnapshot?: () => any;
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

export function useMcpRuntimeBridge(options: RuntimeBridgeOptions) {
  const enabled = ref(false);
  const intervalId = ref<number | null>(null);
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
    const fs = await import('@tauri-apps/plugin-fs');
    const entries = await fs.readDir(bridgeDir);
    const requestEntries = entries.filter((entry) => (entry.name || '').startsWith('request_') && (entry.name || '').endsWith('.json'));

    for (const entry of requestEntries) {
      const requestPath = `${bridgeDir}/${entry.name}`;
      const requestRaw = await fs.readTextFile(requestPath);
      const request = JSON.parse(requestRaw);
      const requestId = request?.requestId || entry.name?.replace(/^request_/, '').replace(/\.json$/, '');
      const responsePath = `${bridgeDir}/response_${requestId}.json`;

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
