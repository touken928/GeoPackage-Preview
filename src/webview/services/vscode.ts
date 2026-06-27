import type { WebviewMessage } from '../../shared/messages';

type VsCodeApi = { postMessage(message: unknown): void; setState(value: unknown): void; getState<T = unknown>(): T };

let api: VsCodeApi | null = null;

declare global {
  interface Window {
    acquireVsCodeApi?: () => VsCodeApi;
  }
}

export function getVsCodeApi(): VsCodeApi | null {
  if (api) return api;
  if (typeof window === 'undefined' || !window.acquireVsCodeApi) return null;
  api = window.acquireVsCodeApi();
  return api;
}

export function postWebviewMessage(message: WebviewMessage): void {
  getVsCodeApi()?.postMessage(message);
}
