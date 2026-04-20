import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

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
  /** @deprecated 已改为 Tauri 事件桥接，不再使用目录 */
  bridgeDir?: string;
}

export function useMcpRuntimeBridge(options: RuntimeBridgeOptions) {
  const enabled = ref(false);
  let unlisten: (() => void) | null = null;

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

  const start = async () => {
    if (!isTauri()) {
      enabled.value = false;
      return;
    }
    try {
      unlisten = await listen('mcp-runtime-request', async (event) => {
        const payload = event.payload as { requestId?: string; method?: string; params?: unknown };
        const requestId = payload?.requestId;
        if (!requestId) return;
        try {
          const data = await processRequest(payload);
          await invoke('mcp_runtime_bridge_reply', { requestId, result: data ?? null });
        } catch (e: unknown) {
          try {
            await invoke('mcp_runtime_bridge_reply', {
              requestId,
              result: { ok: false, error: String(e instanceof Error ? e.message : e) },
            });
          } catch {
            // IPC failure is best-effort
          }
        }
      });
      enabled.value = true;
      options.message.value = 'MCP 运行态桥接已启用（事件，无文件队列）';
    } catch {
      enabled.value = false;
    }
  };

  const stop = () => {
    enabled.value = false;
    if (unlisten) {
      unlisten();
      unlisten = null;
    }
  };

  onMounted(() => {
    void start();
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
