export type LayerKind = 'vector' | 'tile';

export interface OpenDocumentPayload {
  bytes: Uint8Array | ArrayBuffer | number[] | { buffer: ArrayBuffer; byteOffset?: number; byteLength?: number };
  wasmUri: string;
  fileName?: string;
  path?: string;
}

export interface OpenDocumentMessage {
  type: 'openDocument';
  payload?: OpenDocumentPayload;
  bytes?: OpenDocumentPayload['bytes'];
  wasmUri?: string;
  fileName?: string;
  path?: string;
  file?: { name?: string };
}

export interface ReadyMessage {
  type: 'ready';
}

export interface SelectionChangedMessage {
  type: 'selectionChanged';
  payload: {
    layerId: string | null;
    featureId: string | null;
  };
}

export interface ErrorMessage {
  type: 'error';
  message: string;
}

export type ExtensionMessage = OpenDocumentMessage | ErrorMessage;
export type WebviewMessage = ReadyMessage | SelectionChangedMessage;

export interface CrsInfo {
  code: string;
  label: string;
  supported: boolean;
  warning?: string;
}

export interface VectorLayerStyle {
  color: string;
  opacity: number;
}

export interface LayerBase {
  id: string;
  name: string;
  kind: LayerKind;
  visible: boolean;
  active: boolean;
  order: number;
  featureCount?: number;
  tileCount?: number;
  columns?: string[];
  crs?: CrsInfo;
  warning?: string;
}

export interface FeatureRow {
  id: string;
  properties: Record<string, unknown>;
  geometry: any;
}

export interface VectorLayerState extends LayerBase {
  kind: 'vector';
  features: FeatureRow[];
  renderable: boolean;
  style: VectorLayerStyle;
}

export interface TileLayerState extends LayerBase {
  kind: 'tile';
}

export interface DocumentState {
  fileName?: string;
  status: 'idle' | 'loading' | 'ready' | 'error';
  error?: string;
  vectorLayers: VectorLayerState[];
  tileLayers: TileLayerState[];
  activeItemId: string | null;
  activeItemKind: LayerKind | null;
  activeLayerId: string | null;
  selectedFeatureKey: string | null;
}
