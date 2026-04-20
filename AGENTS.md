# Repository Guidelines

This repository is a visual UI designer for Warcraft III Frame UI, built with Vue 3 + TypeScript and optionally packaged as a Tauri desktop app.

## Project Identity

- Project: `frame-ui-designer` (`package.json` name).
- Goal: visually design UI layouts/widgets and export structured output (Lua, TypeScript, JSON via export plugins).
- Stack: Vue 3 (Composition API), TypeScript, Vite, Tauri 2, Node MCP (Streamable HTTP + legacy `POST /call`).
- Package manager: Yarn.

## Project Structure

- `src/`: frontend source code.
- `src/App.vue`: main application shell and state wiring.
- `src/main.ts`: Vue app entry.
- `src/components/`: Vue UI components (panels/dialogs/menus).
- `src/composables/`: core business logic (canvas, widgets, export, history, plugin system, settings, resources).
- `src/plugins/builtin/`: built-in export plugins (e.g. Lua, TypeScript, JSON structured export).
- `src/types/`: shared type definitions.
- `src-tauri/`: Tauri Rust host project and packaging config.
- `mcp/`: MCP server and end-to-end check scripts.
- `integrations/`: integration templates and auxiliary examples.

## Build And Run Commands

Use only scripts defined in `package.json`:

- `yarn dev`: start Vite plus MCP HTTP gateway (`8765`) and runtime bridge HTTP (`8766`) via `concurrently`.
- `yarn dev:vite`: start Vite only (no MCP HTTP processes).
- `yarn build`: build web app to `dist/`.
- `yarn preview`: preview built web app.
- `yarn type-check`: run `vue-tsc --noEmit`.
- `yarn tauri:dev`: run Tauri app in development mode.
- `yarn tauri:build`: build desktop installer/bundle.
- `yarn mcp:start`: start MCP HTTP stack (`http-gateway` + `runtime-bridge-http`). Gateway exposes MCP Streamable HTTP at `http://127.0.0.1:8765/mcp` and **same behavior at** `http://127.0.0.1:8765/` (for Cursor base-URL); `UI_DESIGNER_MCP_STREAM_PATH` changes the `/mcp` path only; legacy `POST /call` remains.
- `yarn mcp:e2e`: run MCP end-to-end checks.
- `yarn mcp:streamable-smoke`: verify Streamable HTTP `/mcp` lists tools via MCP client.
- `yarn mcp:ci-smoke`: run CI-oriented MCP smoke checks.
- `yarn mcp:ci-smoke:strict-runtime`: run smoke checks with live runtime bridge probe.

## Agent And MCP Runtime (Tauri Required)

When an agent **controls the app via MCP**, **verifies full product behavior**, or **tells a user how to run the designer for AI-driven workflows**, assume the **Tauri desktop** runtime only:

- Use **`yarn tauri:dev`** (not `yarn dev` / browser-only Vite) as the UI process under automation. Native filesystem, dialogs, and other Tauri-only paths are missing or incomplete in pure web mode, so browser dev is an invalid target for end-to-end MCP or “does it work” checks.
- The Tauri app **auto-starts the MCP HTTP stack** by default (see `README.md`); if it is disabled, start `yarn mcp:start` separately so Streamable HTTP and the runtime bridge stay available.
- `yarn dev` remains acceptable for **frontend-only** iteration and scripts that do not rely on Tauri features; do **not** present it as equivalent to the desktop for automation or full-capability testing.

## Frontend Architecture Rules

- Prefer Composition API and keep logic in `src/composables/`; components should mostly orchestrate UI.
- Reuse existing composables before creating new state stores.
- Keep data flow explicit: props/events in components, typed interfaces in `src/types/`.
- Avoid large monolithic composables; extract focused helpers when a module grows too broad.
- Keep UI interactions undo/redo-friendly by integrating changes with history logic when applicable.

## Plugin System Rules

- Export plugins must follow the shape validated by `usePluginSystem`:
  - must provide `metadata` (`id`, `name`, `outputFormat`, `type`);
  - must export an `export(context)` function returning a string.
- Built-in plugins live in `src/plugins/builtin/`; custom plugins are scanned from `src/plugins/custom/` when present.
- Any plugin API change must update both runtime validation and related TypeScript types.
- Preserve backward compatibility of plugin metadata fields when possible.

## Tauri And Runtime Rules

- Frontend must remain runnable in pure web mode (`yarn dev`) even when adding Tauri integrations.
- Tauri-specific APIs should be isolated behind composables/feature checks and not break browser-only flow.
- Keep `src-tauri/tauri.conf.json` build commands consistent with the JS toolchain.
- When adding filesystem/dialog features, prefer official Tauri plugins already used by this project.

## MCP Script Rules

- `mcp/http-gateway.mjs`, `mcp/runtime-bridge-http.mjs`, and `mcp/start-http-stack.mjs` must stay runnable with plain Node (`http-gateway` depends on `@modelcontextprotocol/sdk` for Streamable HTTP).
- Validate any MCP protocol changes with `yarn mcp:e2e`.
- For CI readiness of MCP runtime contracts, run `yarn mcp:ci-smoke`.
- If a CI worker can run the UI process, prefer `yarn mcp:ci-smoke:strict-runtime`.
- Keep tool contracts explicit and stable; prefer additive changes over breaking renames.

## Code Quality And Safety

- Use strict TypeScript typing; avoid `any` unless there is a clear boundary reason.
- Keep side effects localized and cancellable (especially for keyboard, drag, and canvas listeners).
- Avoid silent failures; surface actionable errors for export/plugin/runtime operations.
- Do not edit generated build outputs (`dist/`) unless explicitly requested.
- Do not run destructive git commands or revert unrelated user changes.

## Validation Checklist For Agents

For frontend/composable edits:

1. Run `yarn type-check`.
2. If relevant, run `yarn build`.
3. If touching desktop integration, MCP, or anything that depends on Tauri-only behavior, run **`yarn tauri:dev`** and verify there (browser-only `yarn dev` is insufficient for those paths).
4. If touching MCP scripts, run `yarn mcp:ci-smoke` (includes e2e, Streamable smoke, and contract checks).

If local environment lacks Rust or desktop prerequisites, still ensure web/type-check path passes and clearly report what could not be executed.

## Collaboration Conventions

- Keep edits minimal and task-focused.
- Preserve existing naming/style conventions in touched files.
- Prefer incremental, reviewable changes over broad rewrites.
- Reference files with repository-relative paths in communication.
