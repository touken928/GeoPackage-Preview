import * as vscode from 'vscode';
import { GeoPackagePreviewProvider } from './preview/GeoPackagePreviewProvider';

/**
 * Activate the GeoPackage Preview extension.
 *
 * Registers a read-only custom editor provider for `*.gpkg` files contributed
 * via `package.json` under `contributes.customEditors`.
 */
export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      'geopackage.preview',
      new GeoPackagePreviewProvider(context),
      {
        webviewOptions: {
          retainContextWhenHidden: true,
        },
      }
    )
  );
}

export function deactivate(): void {
  // No cleanup needed.
}
