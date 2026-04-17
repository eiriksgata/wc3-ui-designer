import fs from 'node:fs/promises';
import path from 'node:path';

const clone = (value) => JSON.parse(JSON.stringify(value));
const escapeLuaText = (text = '') => String(text).replace(/\]\]/g, '] ]');

const buildWidgetTree = (widgets = []) => {
  const nodeMap = new Map();
  const roots = [];
  widgets.forEach((widget) => {
    nodeMap.set(widget.id, { ...clone(widget), children: [] });
  });
  widgets.forEach((widget) => {
    const node = nodeMap.get(widget.id);
    if (!node) return;
    if (widget.parentId == null) {
      roots.push(node);
      return;
    }
    const parent = nodeMap.get(widget.parentId);
    if (parent) parent.children.push(node);
    else roots.push(node);
  });
  return roots;
};

const defaultProject = () => ({
  widgets: [],
  settings: {
    canvasWidth: 1920,
    canvasHeight: 1080,
    rulerStep: 64,
    gridSnapStep: 16,
    autoSave: false,
    controlPanelWidth: 220,
    canvasBgColor: '#1a1a1a',
    canvasBgImage: '',
  },
  resources: [],
  animations: [],
  nextAnimId: 1,
  exportConfig: {
    exportResourcesEnabled: false,
    exportResourcesPath: '',
    exportCodeEnabled: true,
    exportCodePath: '',
    selectedExportPlugin: 'json-structured-export',
    exportPlugins: [],
  },
});

export class ProjectEngine {
  constructor() {
    this.project = defaultProject();
    this.projectPath = null;
    this.actionAudit = [];
    this.transactionAudit = [];
  }

  async openProject(projectPath) {
    const raw = await fs.readFile(projectPath, 'utf8');
    const parsed = JSON.parse(raw);
    this.project = { ...defaultProject(), ...parsed };
    this.projectPath = projectPath;
    return this.getSnapshot();
  }

  async saveProject(projectPath = this.projectPath) {
    if (!projectPath) {
      throw new Error('projectPath is required');
    }
    await fs.writeFile(projectPath, JSON.stringify(this.project, null, 2), 'utf8');
    this.projectPath = projectPath;
    return { path: projectPath };
  }

  getSnapshot() {
    return {
      projectPath: this.projectPath,
      ...clone(this.project),
      diagnostics: this.validate().diagnostics,
    };
  }

  applyActions(actions = [], options = {}) {
    let nextId =
      (this.project.widgets.reduce((max, widget) => Math.max(max, widget.id || 0), 0) || 0) + 1;
    const errors = [];
    const warnings = [];
    let applied = 0;
    const sessionId = options.sessionId || `session-${Date.now()}`;
    const dryRun = Boolean(options.dryRun);
    const workingProject = dryRun ? clone(this.project) : this.project;
    const startAt = Date.now();

    for (const action of actions) {
      try {
        const actionId = action.actionId || action.idempotencyKey || `action-${Date.now()}-${applied + errors.length}`;

        if (action.type === 'clearProject' && !options.allowDangerous) {
          throw new Error('dangerous action blocked: clearProject');
        }

        if (action.type === 'createWidget') {
          const widgetType = action.payload?.widgetType || 'panel';
          const id = nextId++;
          const widget = {
            id,
            name: `${widgetType}_${id}`,
            type: widgetType,
            parentId: null,
            x: 960,
            y: 540,
            w: 100,
            h: 100,
            enable: true,
            visible: true,
            locked: false,
            text: '',
            image: '',
            ...action.payload?.overrides,
          };
          workingProject.widgets.push(widget);
          this.actionAudit.push({ sessionId, actionId, type: action.type, at: new Date().toISOString(), dryRun });
          applied += 1;
          continue;
        }

        if (action.type === 'updateWidgetProps') {
          const target = workingProject.widgets.find((widget) => widget.id === action.targetId);
          if (!target) throw new Error(`widget not found: ${action.targetId}`);
          Object.assign(target, action.payload || {});
          this.actionAudit.push({ sessionId, actionId, type: action.type, at: new Date().toISOString(), dryRun });
          applied += 1;
          continue;
        }

        if (action.type === 'deleteWidget') {
          const deleteCount = workingProject.widgets.filter((widget) => widget.id === action.targetId || widget.parentId === action.targetId).length;
          if (deleteCount > 10 && !options.allowDangerous) {
            throw new Error('dangerous action blocked: deleteWidget affects more than 10 widgets');
          }
          const toDelete = new Set([action.targetId]);
          let expanded = true;
          while (expanded) {
            expanded = false;
            for (const widget of workingProject.widgets) {
              if (widget.parentId != null && toDelete.has(widget.parentId) && !toDelete.has(widget.id)) {
                toDelete.add(widget.id);
                expanded = true;
              }
            }
          }
          workingProject.widgets = workingProject.widgets.filter((widget) => !toDelete.has(widget.id));
          this.actionAudit.push({ sessionId, actionId, type: action.type, at: new Date().toISOString(), dryRun });
          applied += 1;
          continue;
        }

        if (action.type === 'setParent') {
          const target = workingProject.widgets.find((widget) => widget.id === action.targetId);
          if (!target) throw new Error(`widget not found: ${action.targetId}`);
          target.parentId = action.payload?.parentId ?? null;
          this.actionAudit.push({ sessionId, actionId, type: action.type, at: new Date().toISOString(), dryRun });
          applied += 1;
          continue;
        }

        if (action.type === 'clearProject') {
          workingProject.widgets = [];
          workingProject.animations = [];
          this.actionAudit.push({ sessionId, actionId, type: action.type, at: new Date().toISOString(), dryRun });
          applied += 1;
          continue;
        }

        throw new Error(`unsupported action type: ${action.type}`);
      } catch (error) {
        errors.push(String(error.message || error));
      }
    }

    const elapsedMs = Date.now() - startAt;
    if (dryRun) {
      warnings.push('dry-run enabled: project state not persisted');
    }

    return {
      ok: errors.length === 0,
      applied,
      errors,
      warnings,
      dryRun,
      elapsedMs,
      sessionId,
    };
  }

  validate() {
    const diagnostics = [];
    const byParent = new Map();
    for (const widget of this.project.widgets) {
      const parentKey = widget.parentId == null ? '__root__' : String(widget.parentId);
      const map = byParent.get(parentKey) || new Map();
      const name = (widget.name || '').trim();
      if (name) {
        const count = map.get(name) || 0;
        map.set(name, count + 1);
      }
      byParent.set(parentKey, map);
    }

    for (const [, map] of byParent) {
      for (const [name, count] of map) {
        if (count > 1) diagnostics.push(`duplicate child name: ${name}`);
      }
    }

    const missingResourceCount = this.project.widgets.filter((widget) => {
      if (!widget.image) return false;
      return !this.project.resources.find((resource) => resource.value === widget.image);
    }).length;

    if (missingResourceCount > 0) {
      diagnostics.push(`missing image resources: ${missingResourceCount}`);
    }

    return { ok: diagnostics.length === 0, diagnostics };
  }

  exportStructuredJson() {
    const exportedAt = new Date().toISOString();
    const payload = {
      meta: {
        format: 'ui-designer-structured-json',
        version: '1.0.0',
        exportedAt,
        projectName: this.projectPath ? path.basename(this.projectPath, path.extname(this.projectPath)) : 'GeneratedUI',
      },
      settings: {
        canvasWidth: this.project.settings.canvasWidth,
        canvasHeight: this.project.settings.canvasHeight,
      },
      resources: this.project.resources,
      widgets: {
        flat: this.project.widgets,
        tree: buildWidgetTree(this.project.widgets),
      },
      animations: this.project.animations,
      diagnostics: this.validate().diagnostics,
    };

    return JSON.stringify(payload, null, 2);
  }

  exportTypeScript() {
    const className = this.projectPath ? path.basename(this.projectPath, path.extname(this.projectPath)) : 'GeneratedUI';
    const payload = {
      settings: this.project.settings,
      widgets: this.project.widgets,
      resources: this.project.resources,
      animations: this.project.animations,
    };
    return `/**
 * Auto-generated by ui-designer MCP.
 */
export const ${className} = ${JSON.stringify(payload, null, 2)} as const;
`;
  }

  exportLua() {
    const className = this.projectPath ? path.basename(this.projectPath, path.extname(this.projectPath)) : 'GeneratedUI';
    let lua = '';
    lua += '-- Auto-generated by ui-designer MCP\n';
    lua += `---@class ${className}:Frame.Panel\n`;
    lua += `${className} = Class('${className}', Frame.Panel)\n\n`;
    lua += `function ${className}:ctor()\n`;
    lua += '    Frame.Panel.ctor(self, {\n';
    lua += '        parent = Frame.GameUI,\n';
    lua += '        x = 0,\n';
    lua += '        y = 0,\n';
    lua += '        w = 1920,\n';
    lua += '        h = 1080,\n';
    lua += '        image = Const.Texture.blank,\n';
    lua += '    })\n\n';

    this.project.widgets.forEach((widget) => {
      const widgetName = widget.name || `${widget.type}_${widget.id}`;
      lua += `    self.${widgetName} = self:createChild('${widget.type}', {\n`;
      lua += `        x = ${Math.round(widget.x || 0)},\n`;
      lua += `        y = ${Math.round(widget.y || 0)},\n`;
      lua += `        w = ${Math.round(widget.w || 100)},\n`;
      lua += `        h = ${Math.round(widget.h || 100)},\n`;
      if (widget.text) {
        lua += `        text = [[${escapeLuaText(widget.text)}]],\n`;
      }
      if (widget.image) {
        lua += `        image = [[${escapeLuaText(widget.image)}]],\n`;
      }
      lua += '    })\n';
    });

    lua += 'end\n';
    return lua;
  }

  async exportCode({ outputPath, pluginId = 'json-structured-export' }) {
    let output = '';
    if (pluginId === 'lua-export' || pluginId === 'lua') {
      output = this.exportLua();
    } else if (pluginId === 'typescript-export' || pluginId === 'typescript' || pluginId === 'ts') {
      output = this.exportTypeScript();
    } else {
      output = this.exportStructuredJson();
    }
    await fs.writeFile(outputPath, output, 'utf8');
    return {
      outputFiles: [outputPath],
      pluginId,
      elapsedMs: 0,
      warnings: [],
    };
  }

  getAuditTrail(limit = 100) {
    return this.actionAudit.slice(-limit);
  }

  appendTransactionEvent(event) {
    this.transactionAudit.push({
      ...event,
      at: event.at || new Date().toISOString(),
    });
  }

  getTransactionAuditTrail(limit = 100) {
    return this.transactionAudit.slice(-limit);
  }
}
