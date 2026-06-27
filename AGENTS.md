# AGENTS.md

## Repo shape
- This repo is a VS Code extension, not a web app. The host entrypoint is `src/extension.ts`; the custom editor bridge lives in `src/preview/GeoPackagePreviewProvider.ts`.
- GeoPackage parsing happens in the webview, not the extension host. The webview entrypoint is `src/webview/main.tsx`; most app wiring is in `src/webview/App.tsx` and `src/webview/services/geopackage.ts`.
- Treat `src/shared/messages.ts` as the canonical host↔webview message schema.

## Commands
- Install: `npm install`
- Build: `npm run build`
- Watch: `npm run watch`
- Package VSIX: `npm run package`
- Typecheck host: `npx tsc --noEmit -p tsconfig.json`
- Typecheck webview: `npx tsc --noEmit -p tsconfig.webview.json`
- `npm run lint` is a stub that only prints `lint not configured`.

## Build and asset quirks
- The build is driven by `esbuild.mjs`, not `tsc`. `tsc` is verification only.
- `npm run build` must produce both bundles and copy `sql-wasm.wasm` plus `geopackage.min.js` into `out/webview/`. If webview changes fail at runtime, check those copied assets first.
- `webview.options.localResourceRoots` only allows assets under `out/`, so new webview-loaded files must end up there.

## Editing guidance
- Keep host and webview concerns separate: host reads bytes and opens the editor; webview parses, renders, and manages selection/UI state.
- Be careful with message types: `src/webview/types.ts` partially duplicates protocol types and has known drift from `src/shared/messages.ts`. Prefer consolidating toward `src/shared/messages.ts` instead of adding more parallel message shapes.
- Tile layers are intentionally metadata-only today; they appear in the sidebar but are not rendered on the map.
- The host rejects `.gpkg` files larger than `50 MB`; preserve that guard unless the task explicitly changes product behavior.

## Verification
- Preferred focused verification after code changes: `npx tsc --noEmit -p tsconfig.json && npx tsc --noEmit -p tsconfig.webview.json && npm run build`
- For interactive debugging, use `.vscode/launch.json` and run `Run GeoPackage Preview Extension` in VS Code.

## Ignore / stale context
- Do not rely on `.slim/deepwork/gpkg-preview-extension.md` for current architecture; it is a stale design note.
