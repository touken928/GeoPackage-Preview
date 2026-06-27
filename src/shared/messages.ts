// ---------------------------------------------------------------------------
// Shared message types for the host <-> webview protocol.
// Both sides import these to stay in sync.
// ---------------------------------------------------------------------------

/** Every message may carry an optional requestId for request/response tracking. */
interface BaseMessage {
  type: string;
  requestId?: string;
}

// ── Webview → Host ──────────────────────────────────────────────────────────

/** Webview is initialized and ready to receive the document payload. */
export interface ReadyMessage extends BaseMessage {
  type: 'ready';
}

// ── Host → Webview ──────────────────────────────────────────────────────────

/** Host delivers the raw file bytes + metadata + WASM URI. */
export interface OpenDocumentMessage extends BaseMessage {
  type: 'openDocument';
  file: {
    /** File name (e.g. "my-data.gpkg"). */
    name: string;
    /** Full vscode.Uri string for the document. */
    uri: string;
  };
  /** Raw file bytes as an ArrayBuffer (transferred via transferables). */
  bytes: ArrayBuffer;
  /** Webview-accessible URI for the sql-wasm.wasm asset. */
  wasmUri: string;
}

/** Generic error sent from host to webview. */
export interface ErrorMessage extends BaseMessage {
  type: 'error';
  message: string;
}

// ── Unions ──────────────────────────────────────────────────────────────────

/** Messages the webview sends to the extension host. */
export type WebviewMessage = ReadyMessage;

/** Messages the extension host sends to the webview. */
export type ExtensionMessage = OpenDocumentMessage | ErrorMessage;
