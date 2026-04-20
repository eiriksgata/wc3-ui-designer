import { onBeforeUnmount, ref, type Ref } from 'vue';
import { invoke } from '@tauri-apps/api/core';

/** 比 isTauri() 更可靠：仅当注入脚本已执行时为真 */
function isTauriRuntimeReady(): boolean {
  return typeof window !== 'undefined' && !!(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
}

declare global {
  interface Window {
    /** Rust 侧 `webview.eval` 同步调用；内部用 queueMicrotask 再 invoke，避免与 Wry 重入 */
    __uiDesignerMcpRuntimeDispatch?: (payload: unknown) => void;
  }
}

/** Tauri IPC 需要可 JSON 序列化的纯对象，去掉 Vue Proxy / 循环引用等 */
function toPlainJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function normalizeRuntimePayload(raw: unknown): {
  requestId?: string;
  method?: string;
  params?: unknown;
} {
  if (raw == null) return {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as { requestId?: string; method?: string; params?: unknown };
    } catch {
      return {};
    }
  }
  return raw as { requestId?: string; method?: string; params?: unknown };
}

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
  /**
   * Phase 4: 提案-确认门禁。AI 通过 ui_runtime_call(method="proposeActions") 进来，
   * 前端排入队列，用户 Accept/Reject 后 Promise resolve，返回给 AI。
   */
  proposeActions?: (request: {
    actions: any[];
    sessionId?: string;
    reason?: string;
    title?: string;
  }) => Promise<any>;
};

interface RuntimeBridgeOptions {
  api: RuntimeActionApi;
  message: Ref<string>;
  /** @deprecated 已改为 Tauri 事件桥接，不再使用目录 */
  bridgeDir?: string;
}

export function useMcpRuntimeBridge(options: RuntimeBridgeOptions) {
  const enabled = ref(false);

  const processRequest = async (request: any) => {
    const method = String(request?.method || '');
    const params = request?.params || {};
    const api = options.api;

    if (!method) {
      throw new Error('invalid runtime request: method is required');
    }

    if (method === 'batchApply') return api.batchApply?.(params.actions || []);
    if (method === 'proposeActions') {
      const p = (params || {}) as any;
      return api.proposeActions?.({
        actions: p.actions || [],
        sessionId: p.sessionId,
        reason: p.reason,
        title: p.title,
      });
    }
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
    if (!isTauriRuntimeReady()) {
      enabled.value = false;
      return;
    }
    try {
      window.__uiDesignerMcpRuntimeDispatch = (raw: unknown) => {
        queueMicrotask(() => {
          void (async () => {
            const payload = normalizeRuntimePayload(raw);
            const requestId = payload.requestId ?? (payload as { request_id?: string }).request_id;
            if (!requestId) {
              console.warn('[ui-designer] MCP 运行态缺少 requestId，已忽略', raw);
              return;
            }
            const req = { ...payload, requestId };
            try {
              const data = await processRequest(req);
              const result = data === undefined ? null : toPlainJson(data);
              // Tauri 2 命令参数必须与形参名一致：后端为 `reply: McpRuntimeBridgeReply`，
              // 因此顶层键必须是 `reply`，否则 IPC 立即以 "missing required key reply" 拒收。
              await invoke('mcp_runtime_bridge_reply', { reply: { requestId, result } });
            } catch (e: unknown) {
              const errText = String(e instanceof Error ? e.message : e);
              console.error('[ui-designer] MCP 运行态处理失败', requestId, errText);
              try {
                await invoke('mcp_runtime_bridge_reply', {
                  reply: {
                    requestId,
                    result: toPlainJson({ ok: false, error: errText }),
                  },
                });
              } catch (ipcErr) {
                console.error('[ui-designer] MCP 运行态 bridge_reply 调用失败', ipcErr);
              }
            }
          })();
        });
      };
      enabled.value = true;
      options.message.value = 'MCP 运行态桥接已启用（webview.eval + 全局回调）';
      if (import.meta.env.DEV) {
        console.info('[ui-designer] MCP 运行态已注册 window.__uiDesignerMcpRuntimeDispatch');
      }
    } catch (e) {
      enabled.value = false;
      console.error('[ui-designer] MCP 运行态桥接注册失败', e);
    }
  };

  const stop = () => {
    enabled.value = false;
    if (typeof window !== 'undefined') {
      delete window.__uiDesignerMcpRuntimeDispatch;
    }
  };

  // 必须在 setup 同步注册：Rust 可能在首帧前就对 webview eval，等 onMounted 会竞态超时
  if (isTauriRuntimeReady()) {
    void start();
  }

  onBeforeUnmount(() => {
    stop();
  });

  return {
    enabled,
    start,
    stop,
  };
}
