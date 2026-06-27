import * as vscode from 'vscode';
import * as path from 'path';
import { getNonce } from '../util/getNonce';
import type { WebviewMessage, ExtensionMessage } from '../shared/messages';

/**
 * Read-only custom editor provider for `.gpkg` files.
 *
 * The extension host does **not** parse the GeoPackage.  It only reads the raw
 * file bytes and forwards them (plus metadata and the WASM URI) to the webview.
 * All parsing / rendering happens client-side in the webview via sql.js + WASM.
 */
export class GeoPackagePreviewProvider
  implements vscode.CustomReadonlyEditorProvider
{
  constructor(private readonly _context: vscode.ExtensionContext) {}

  // -----------------------------------------------------------------------
  // CustomReadonlyEditorProvider
  // -----------------------------------------------------------------------

  async openCustomDocument(
    uri: vscode.Uri,
    _openContext: vscode.CustomDocumentOpenContext,
    _token: vscode.CancellationToken
  ): Promise<vscode.CustomDocument> {
    return { uri, dispose: () => {} };
  }

  async resolveCustomEditor(
    document: vscode.CustomDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    const webview = webviewPanel.webview;
    const nonce = getNonce();

    webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this._context.extensionUri, 'out'),
      ],
    };

    webview.html = this._getHtml(webview, nonce);

    // ── Message handling ────────────────────────────────────────────────

    webview.onDidReceiveMessage(
      (message: WebviewMessage) => {
        switch (message.type) {
          case 'ready':
            this._handleReady(document, webview, message);
            break;
          default:
            console.warn(
              `[GeoPackagePreviewProvider] Unknown message type: ${(message as any).type}`
            );
        }
      },
      undefined,
      this._context.subscriptions
    );
  }

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  private async _handleReady(
    document: vscode.CustomDocument,
    webview: vscode.Webview,
    _message: WebviewMessage
  ): Promise<void> {
    try {
      // Read raw file bytes from the filesystem.
      const uint8 = await vscode.workspace.fs.readFile(document.uri);

      // ── File-size guardrail ──────────────────────────────────────────
      // The MVP webview loads the entire file into a WASM sql.js instance.
      // Cap at 50 MB to keep the MVP path tractable.
      const MAX_MVP_BYTES = 50 * 1024 * 1024; // 50 MB
      if (uint8.byteLength > MAX_MVP_BYTES) {
        const sizeMb = (uint8.byteLength / (1024 * 1024)).toFixed(1);
        webview.postMessage({
          type: 'error',
          message: `File is ${sizeMb} MB. The MVP preview supports files up to 50 MB.`,
        } satisfies ExtensionMessage);
        return;
      }

      // Produce a standalone ArrayBuffer (copy) for the webview.
      // VSCode's postMessage uses structured-clone which can transfer ArrayBuffer.
      const bytes = uint8.buffer.slice(
        uint8.byteOffset,
        uint8.byteOffset + uint8.byteLength
      ) as ArrayBuffer;

      const wasmUri = webview.asWebviewUri(
        vscode.Uri.joinPath(
          this._context.extensionUri,
          'out',
          'webview',
          'sql-wasm.wasm'
        )
      );

      const response: ExtensionMessage & { type: 'openDocument' } = {
        type: 'openDocument',
        file: {
          name: path.basename(document.uri.fsPath),
          uri: document.uri.toString(),
        },
        bytes,
        wasmUri: wasmUri.toString(),
      };

      // Send the message. Structured-clone serialization handles ArrayBuffer natively.
      webview.postMessage(response);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : String(err);
      const errorPayload: ExtensionMessage & { type: 'error' } = {
        type: 'error',
        message: `Failed to read file: ${errorMessage}`,
      };
      webview.postMessage(errorPayload);
    }
  }

  private _getHtml(webview: vscode.Webview, nonce: string): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._context.extensionUri, 'out', 'webview', 'main.js')
    );
    const geopackageScriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._context.extensionUri, 'out', 'webview', 'geopackage.min.js')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._context.extensionUri, 'out', 'webview', 'main.css')
    );

    const cspSource = webview.cspSource;

    return /* html */ `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta
    http-equiv="Content-Security-Policy"
    content="
      default-src 'none';
      script-src 'nonce-${nonce}' ${cspSource} 'wasm-unsafe-eval';
      style-src 'unsafe-inline' ${cspSource};
      img-src ${cspSource} https: data: blob:;
      connect-src ${cspSource} https: data: blob:;
      worker-src blob:;
      font-src ${cspSource};
    "
  />
  <link rel="stylesheet" href="${styleUri}" />
  <title>GeoPackage Preview</title>
</head>
<body>
  <div id="root">Loading GeoPackage preview…</div>
  <script nonce="${nonce}" src="${geopackageScriptUri}"></script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`.trim();
  }
}
