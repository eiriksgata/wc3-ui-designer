<template>
  <v-dialog
    :model-value="visible"
    width="820"
    scrim="rgba(9, 11, 15, 0.72)"
    @update:model-value="onDialogModelUpdate"
  >
    <v-card class="mcp-usage-dialog" rounded="xl" elevation="12">
      <div class="mcp-usage-header">
        <h2>MCP 使用说明</h2>
        <v-btn icon variant="text" size="small" @click="close">
          <v-icon icon="mdi-close" />
        </v-btn>
      </div>

      <v-card-text class="mcp-usage-content">
        <section class="mcp-section">
          <h3>0) VS Code / Copilot（MCP Streamable HTTP）</h3>
          <p class="tip">
            网关在同一端口提供 <strong>MCP Streamable HTTP</strong>（<code>/</code> 与
            <code>/mcp</code> 等价，Cursor 填无路径的 <code>http://127.0.0.1:8765</code> 亦可）。请先
            <code>yarn mcp:start</code> 或 <code>yarn dev</code>，再写入 <code>mcp.json</code>。遗留脚本仍可用
            <code>POST /call</code>。
          </p>
          <div class="form-grid">
            <div>
              <label for="mcp-server-id">Server ID</label>
              <v-text-field
                id="mcp-server-id"
                v-model="mcpConfig.serverId"
                density="compact"
                variant="outlined"
                hide-details
                placeholder="uiDesigner"
              />
            </div>
            <div class="full">
              <label for="mcp-stream-url">Streamable HTTP URL（推荐带 / 或 /mcp）</label>
              <v-text-field
                id="mcp-stream-url"
                v-model="mcpConfig.streamUrl"
                density="compact"
                variant="outlined"
                hide-details
                placeholder="http://127.0.0.1:8765/"
              />
            </div>
          </div>
          <p class="tip">复制到 VS Code：<code>.vscode/mcp.json</code> 或用户级 MCP 配置。</p>
          <pre class="json-example">{{ vscodeMcpJson }}</pre>
          <div class="actions-row">
            <v-btn size="small" variant="outlined" color="secondary" @click="applyDefaultPreset">默认 URL 预设</v-btn>
            <v-btn size="small" variant="flat" color="primary" @click="copyVscodeJson">复制 VS Code JSON</v-btn>
          </div>
          <p v-if="copyMessage" class="tip">{{ copyMessage }}</p>
        </section>

        <section class="mcp-section">
          <h3>1) 功能说明</h3>
          <p>
            UI 设计器已内置 MCP 运行态桥接，会轮询工程目录下的
            <code>mcp-runtime</code> 文件夹并处理请求。
          </p>
          <p>
            你可以通过写入请求文件，调用设计器能力（如读取快照、批量修改、导出、撤销重做）。
          </p>
        </section>

        <section class="mcp-section">
          <h3>2) 目录与文件约定</h3>
          <ul>
            <li>请求文件：<code>mcp-runtime/request_&lt;requestId&gt;.json</code></li>
            <li>响应文件：<code>mcp-runtime/response_&lt;requestId&gt;.json</code></li>
            <li>请求建议在 2 分钟内处理，过期会返回错误。</li>
          </ul>
        </section>

        <section class="mcp-section">
          <h3>3) 常用方法</h3>
          <p>
            支持的方法包括：<code>batchApply</code>、<code>getProjectSnapshot</code>、
            <code>replaceProjectSnapshot</code>、<code>validate</code>、
            <code>exportWithPlugin</code>、<code>exportStructuredJson</code>、
            <code>listExportPlugins</code>、<code>undo</code>、<code>redo</code>。
          </p>
        </section>

        <section class="mcp-section">
          <h3>4) 请求示例</h3>
          <pre class="json-example">{
  "requestId": "demo-001",
  "createdAt": "2026-04-17T12:00:00.000Z",
  "method": "getProjectSnapshot",
  "params": {}
}</pre>
          <p class="tip">
            写入后等待生成对应 response 文件，读取其中 <code>ok</code>、<code>data</code>、<code>error</code> 字段即可。
          </p>
        </section>
      </v-card-text>

      <v-card-actions class="mcp-usage-footer">
        <v-btn @click="close" variant="flat" color="primary">关闭</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';

const props = defineProps<{
  visible: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
}>();

const close = () => {
  if (!props.visible) return;
  emit('update:visible', false);
};

const onDialogModelUpdate = (value: boolean) => {
  if (!value) close();
};

const mcpConfig = ref({
  serverId: 'uiDesigner',
  streamUrl: 'http://127.0.0.1:8765/',
});

const copyMessage = ref('');

const vscodeMcpJsonObject = computed(() => ({
  servers: {
    [mcpConfig.value.serverId || 'uiDesigner']: {
      type: 'http',
      url: mcpConfig.value.streamUrl || 'http://127.0.0.1:8765/',
    },
  },
}));

const vscodeMcpJson = computed(() => JSON.stringify(vscodeMcpJsonObject.value, null, 2));

const applyDefaultPreset = () => {
  mcpConfig.value.serverId = 'uiDesigner';
  mcpConfig.value.streamUrl = 'http://127.0.0.1:8765/';
};

const copyVscodeJson = async () => {
  try {
    await navigator.clipboard.writeText(vscodeMcpJson.value);
    copyMessage.value = '已复制到剪贴板';
  } catch {
    copyMessage.value = '复制失败，请手动复制';
  }
};
</script>

<style scoped>
.mcp-usage-dialog {
  width: min(760px, 92vw);
  max-height: 84vh;
  background: #2d2d30;
  border: 1px solid #3e3e42;
  border-radius: 8px;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
}

.mcp-usage-header {
  padding: 14px 18px;
  border-bottom: 1px solid #3e3e42;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.mcp-usage-header h2 {
  margin: 0;
  color: #eee;
  font-size: 18px;
}

.mcp-usage-content {
  overflow: auto;
  color: #d0d0d0;
}

.mcp-section {
  margin-bottom: 18px;
}

.mcp-section:last-child {
  margin-bottom: 0;
}

.mcp-section h3 {
  margin: 0 0 8px;
  font-size: 14px;
  color: #4ec9b0;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.form-grid .full {
  grid-column: 1 / -1;
}

.actions-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.mcp-section p {
  margin: 8px 0;
  line-height: 1.6;
}

.mcp-section ul {
  margin: 8px 0 0;
  padding-left: 18px;
}

.mcp-section li {
  margin: 6px 0;
}

code {
  background: #1e1e1e;
  border: 1px solid #454549;
  border-radius: 4px;
  padding: 1px 6px;
  color: #f0f0f0;
}

.json-example {
  margin: 8px 0;
  background: #1e1e1e;
  border: 1px solid #3e3e42;
  border-radius: 6px;
  padding: 10px 12px;
  color: #e6e6e6;
  overflow: auto;
  font-size: 12px;
  line-height: 1.5;
}

.tip {
  font-size: 12px;
  color: #b7b7b7;
}

.mcp-usage-footer {
  padding: 12px 18px;
  border-top: 1px solid #3e3e42;
  display: flex;
  justify-content: flex-end;
}
</style>
