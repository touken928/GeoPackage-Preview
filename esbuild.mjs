import * as esbuild from 'esbuild';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const isWatch = process.argv.includes('--watch');

/** @type {esbuild.BuildOptions} */
const hostConfig = {
  entryPoints: ['src/extension.ts'],
  outfile: 'out/extension.js',
  bundle: true,
  platform: 'node',
  target: 'node16',
  external: ['vscode'],
  format: 'cjs',
  sourcemap: true,
  minify: false,
};

/** @type {esbuild.BuildOptions} */
const webviewConfig = {
  entryPoints: ['src/webview/main.tsx'],
  outfile: 'out/webview/main.js',
  bundle: true,
  platform: 'browser',
  target: 'es2020',
  format: 'iife',
  jsx: 'automatic',
  jsxImportSource: 'react',
  sourcemap: true,
  minify: false,
  loader: {
    '.ts': 'ts',
    '.tsx': 'tsx',
    '.css': 'css',
  },
};

function resolveFirstExisting(candidates) {
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function copyWebviewAssets() {
  const destDir = path.resolve(__dirname, 'out', 'webview');

  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  const wasmSource = resolveFirstExisting([
    path.resolve(__dirname, 'node_modules', '@ngageoint', 'geopackage', 'dist', 'sql-wasm.wasm'),
    path.resolve(__dirname, 'node_modules', '@ngageoint', 'geopackage', 'sql.js', 'sql-wasm.wasm'),
    path.resolve(__dirname, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'),
    path.resolve(__dirname, 'node_modules', '@ngageoint', 'geopackage', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'),
  ]);

  const geopackageBrowserSource = resolveFirstExisting([
    path.resolve(__dirname, 'node_modules', '@ngageoint', 'geopackage', 'dist', 'geopackage.min.js'),
  ]);

  if (wasmSource) {
    const wasmDest = path.resolve(destDir, 'sql-wasm.wasm');
    fs.copyFileSync(wasmSource, wasmDest);
    console.log(`[copy-assets] Copied sql-wasm.wasm to ${wasmDest}`);
  } else {
    console.warn(
      '[copy-assets] WARNING: sql-wasm.wasm not found. ' +
      'Run `npm install` to resolve. Expected in @ngageoint/geopackage/sql.js/ or node_modules/sql.js/dist/.'
    );
  }

  if (geopackageBrowserSource) {
    const geopackageDest = path.resolve(destDir, 'geopackage.min.js');
    fs.copyFileSync(geopackageBrowserSource, geopackageDest);
    console.log(`[copy-assets] Copied geopackage.min.js to ${geopackageDest}`);
  } else {
    console.warn('[copy-assets] WARNING: geopackage.min.js not found.');
  }
}

async function main() {
  console.log('[esbuild] Building extension host bundle...');
  const hostCtx = await esbuild.context(hostConfig);

  console.log('[esbuild] Building webview bundle...');
  const webviewCtx = await esbuild.context(webviewConfig);

  if (isWatch) {
    await Promise.all([hostCtx.watch(), webviewCtx.watch()]);
    console.log('[esbuild] Watching for changes...');
  } else {
    await Promise.all([hostCtx.rebuild(), webviewCtx.rebuild()]);
    await Promise.all([hostCtx.dispose(), webviewCtx.dispose()]);
    copyWebviewAssets();
    console.log('[esbuild] Build complete.');
  }
}

main().catch((e) => {
  console.error('[esbuild] Build failed:', e);
  process.exit(1);
});
