# Repository Guidelines

This repository is a visual UI designer for Warcraft III Frame UI, built with Vue 3 + TypeScript and optionally packaged as a Tauri desktop app.

## Project Identity

- Project: `frame-ui-designer` (`package.json` name).
- Goal: visually design UI layouts/widgets and export structured output (Lua, TypeScript, JSON via export plugins).
- Stack: Vue 3 (Composition API), TypeScript, Vite, Tauri 2, **Rust MCP** (`rmcp`, Streamable HTTP in-process; no Node MCP server).
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
- `scripts/`: MCP 相关 Node 脚本（CI 冒烟、`mcp-apply-shop-demo` 等；MCP **服务端**在 Rust）。
- `integrations/`: integration templates and auxiliary examples.

## Build And Run Commands

Use only scripts defined in `package.json`:

- `yarn dev`: start Vite only (no MCP; use Tauri for MCP).
- `yarn dev:vite`: same as `yarn dev`.
- `yarn build`: build web app to `dist/`.
- `yarn preview`: preview built web app.
- `yarn type-check`: run `vue-tsc --noEmit`.
- `yarn tauri:dev`: run Tauri app in development mode.
- `yarn tauri:build`: build desktop installer/bundle.
- `yarn mcp:e2e`: run `cargo test -p app --lib` (project engine smoke).
- `yarn mcp:streamable-smoke`: static checks on `src-tauri/src/mcp_http.rs` tool contracts.
- `yarn mcp:ci-smoke`: `cargo test` + streamable-smoke + integration example keyword checks.
- `yarn mcp:ci-smoke:strict-runtime`: compatibility only (file-queue probe removed; use Tauri locally for runtime).

## Agent And MCP Runtime (Tauri Required)

When an agent **controls the app via MCP**, **verifies full product behavior**, or **tells a user how to run the designer for AI-driven workflows**, assume the **Tauri desktop** runtime only:

- Use **`yarn tauri:dev`** (not `yarn dev` / browser-only Vite) as the UI process under automation. Native filesystem, dialogs, and other Tauri-only paths are missing or incomplete in pure web mode, so browser dev is an invalid target for end-to-end MCP or “does it work” checks.
- The Tauri app **auto-starts the Rust MCP HTTP listener** by default (see `README.md`); runtime bridge uses Tauri events (no separate Node process).
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

- MCP **server** lives in Rust (`src-tauri/src/mcp_http.rs`); `scripts/mcp-*.mjs` are CI, demos, or helpers only.
- Validate engine changes with `yarn mcp:e2e` (`cargo test`) and contracts with `yarn mcp:ci-smoke`.
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
4. If touching MCP or `project_engine`, run `yarn mcp:ci-smoke` (includes `cargo test`, static `mcp_http` checks, and integration example checks).

If local environment lacks Rust or desktop prerequisites, still ensure web/type-check path passes and clearly report what could not be executed.

## Collaboration Conventions

- Keep edits minimal and task-focused.
- Preserve existing naming/style conventions in touched files.
- Prefer incremental, reviewable changes over broad rewrites.
- Reference files with repository-relative paths in communication.

## Template Codegen Rules (wc3-map-ts-template)

This designer is paired with the [`wc3-map-ts-template`](../wc3-map-ts-template/) WC3 map repo through an explicit AI loop: **AI designs UI → user Accepts in the designer → codegen writes TS into the template repo → user can edit freely outside the generated block → next round pulls it back**. Agents touching the integration surface must honor the following:

1. **Single source of truth for generated TS**: the `wc3-template-export` plugin ([`src/plugins/builtin/wc3-template-export.ts`](src/plugins/builtin/wc3-template-export.ts)) and [`integrations/wc3-map-ts-template/codegen.mjs`](integrations/wc3-map-ts-template/codegen.mjs) must produce **byte-identical output** for the same input. If you change one, change the other.
2. **BEGIN/END markers are sacrosanct**: generated code is delimited by `// <ui-designer:generated:BEGIN>` / `// <ui-designer:generated:END>`. Agents must not emit code outside these markers, and must not remove these markers. All human-authored business logic (event callbacks, state wiring) lives outside them.
3. **Sidecar is the reverse-import contract**: every `*.ts` emitted by the template exporter must be accompanied by a `*.ui.json` sidecar with `{ generator: "wc3-template-export", widgets, settings, animations, ... }`. `ui_import_from_sidecar` (in [`src-tauri/src/mcp_http.rs`](src-tauri/src/mcp_http.rs)) only accepts sidecars whose `generator` field matches, to avoid AST-parsing TS.
4. **Resource path contract & self-service copy**: all widget image paths exported to the template repo must be rooted at `war3mapImported/`. The codegen CLI enforces this with `--resources-prefix war3mapImported/` (default) and can be made hard-fail with `--strict`. AI agents that wire in a local image (absolute disk path, e.g. from the user's drop zone) are expected to self-service the move:
   - `ui_list_resources` — inspect which `value`s are used, who references them, whether the source `localPath` still exists, and whether they are registered in `project.resources`.
   - `ui_normalize_resource_paths` — rewrite any widget fields that still carry a raw absolute path (e.g. `C:\Users\Me\icon.blp`) into `war3mapImported/<basename>` and register the corresponding `ImageResource`. Run this after a batch of `ui_apply_actions` that may have introduced raw paths.
   - `ui_copy_resources` — copy the source files from each `ImageResource.localPath` into a target directory (typically the template repo's `resource/`). Unless the user specifies otherwise, the template-side `yarn ui:pull` does this automatically via `--copy-resources <repo>/resource`.
5. **Proposal gateway for AI changes**: AI-originated bulk changes should route through `ui_runtime_call(method="proposeActions", params={actions, sessionId, reason, title})`. This surfaces a user-facing Accept/Reject overlay via `src/composables/useProposals.ts` + `src/components/ProposalPanel.vue`. Bypassing the proposal layer (direct `ui_apply_actions` with `dryRun:false`) is only acceptable for small, low-risk edits or when the user has explicitly waived review.
6. **Standard loop command order** (both repos assumed cloned as siblings):
   1. `yarn tauri:dev` (this repo) — start the designer + MCP
   2. `yarn ui:pull` (template repo) — regenerate `src/ui/generated/*.ts` + `.ui.json`
   3. `yarn build:dev` (template repo) — verify the generated TS compiles against wc3ts
   4. `yarn ui:check` (template repo) — gate CI; exits 1 on drift
   5. `yarn ui:push` (template repo) — push sidecar edits back into the running designer (rare; usually used after manual layout tweaks in the template)
