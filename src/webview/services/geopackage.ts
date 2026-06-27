import proj4 from 'proj4';
import { register } from 'ol/proj/proj4';
import type { CrsInfo, FeatureRow, TileLayerState, VectorLayerState } from '../types';

type AnyRecord = Record<string, any>;

declare global {
  interface Window {
    GeoPackage?: AnyRecord;
  }
}

let proj4Registered = false;

function ensureProj4Registered() {
  if (proj4Registered) return;
  register(proj4 as any);
  proj4Registered = true;
}

function toUint8Array(bytes: Uint8Array | ArrayBuffer | number[] | { buffer: ArrayBuffer; byteOffset?: number; byteLength?: number }): Uint8Array {
  if (bytes instanceof Uint8Array) return bytes;
  if (bytes instanceof ArrayBuffer) return new Uint8Array(bytes);
  if (Array.isArray(bytes)) return Uint8Array.from(bytes);
  if (bytes && bytes.buffer instanceof ArrayBuffer) {
    return new Uint8Array(bytes.buffer, bytes.byteOffset ?? 0, bytes.byteLength ?? bytes.buffer.byteLength);
  }
  throw new Error('Unsupported document byte payload.');
}

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer;
}

function getBrowserApi(): AnyRecord {
  const geopackageModule = window.GeoPackage;
  if (!geopackageModule) {
    throw new Error('GeoPackage browser library did not load.');
  }

  return geopackageModule.GeoPackageManager ?? geopackageModule.GeoPackageAPI ?? geopackageModule.default ?? geopackageModule;
}

function setSqljsWasmLocation(wasmUri: string) {
  const api = getBrowserApi();
  const geopackageModule = window.GeoPackage ?? {};
  const candidates = [geopackageModule, api];
  for (const candidate of candidates) {
    if (candidate && typeof candidate.setSqljsWasmLocateFile === 'function') {
      candidate.setSqljsWasmLocateFile(() => wasmUri);
    }
    if (candidate && typeof candidate.setSqljsWasmUri === 'function') {
      candidate.setSqljsWasmUri(wasmUri);
    }
    if (candidate && typeof candidate.setSqlJsWasmLocateFile === 'function') {
      candidate.setSqlJsWasmLocateFile(() => wasmUri);
    }
  }
}

async function openGeoPackage(bytes: Uint8Array): Promise<AnyRecord> {
  const api = getBrowserApi();
  const payloads: Array<unknown> = [bytes, asArrayBuffer(bytes)];
  const openNames = ['open', 'openGeoPackage', 'openWithArrayBuffer'];
  let lastError: unknown;

  for (const name of openNames) {
    const fn = api?.[name];
    if (typeof fn !== 'function') continue;
    for (const payload of payloads) {
      try {
        return await fn.call(api, payload);
      } catch (error) {
        lastError = error;
      }
    }
  }

  const reason = lastError instanceof Error ? ` ${lastError.message}` : '';
  throw new Error(`Unable to open GeoPackage with the browser/WASM API.${reason}`);
}

async function callMaybe(target: AnyRecord, names: string[], ...args: unknown[]): Promise<any> {
  let lastError: unknown;

  for (const name of names) {
    const fn = target?.[name];
    if (typeof fn === 'function') {
      try {
        return await fn.apply(target, args);
      } catch (error) {
        lastError = error;
      }
    }
  }

  if (lastError) {
    throw lastError;
  }

  return undefined;
}

function isIterable(value: unknown): value is Iterable<unknown> {
  return typeof value === 'object' && value !== null && Symbol.iterator in value;
}

function featureKey(layerId: string, featureId: string | number): string {
  return `${layerId}:${String(featureId)}`;
}

function normalizeFeature(feature: AnyRecord, layerId: string, index: number): FeatureRow {
  const idCandidate = feature.id ?? feature.featureId ?? feature.fid ?? feature.properties?.id ?? feature.properties?.fid ?? feature.properties?.ogc_fid ?? index;
  const id = String(idCandidate);
  return {
    id: featureKey(layerId, id),
    properties: { ...(feature.properties ?? {}) },
    geometry: feature.geometry ?? null,
  };
}

function collectColumns(features: FeatureRow[]): string[] {
  const seen = new Set<string>();
  for (const feature of features) {
    for (const key of Object.keys(feature.properties ?? {})) seen.add(key);
  }
  return [...seen].sort((a, b) => a.localeCompare(b));
}

function readSrsInfo(table: AnyRecord, fallbackName: string): CrsInfo | undefined {
  const srs = table?.getSrs?.() ?? table?.srs ?? table?.tableSrs ?? table?.contents?.srs;
  const organization = srs?.organization ?? srs?.org ?? 'EPSG';
  const coordsysId = srs?.organizationCoordsysId ?? srs?.srs_id ?? srs?.srsId ?? srs?.epsg ?? srs?.code;
  const code = coordsysId != null ? `${organization}:${coordsysId}` : undefined;
  const definition = srs?.definition ?? srs?.definition_12_063 ?? srs?.proj4text ?? srs?.wkt;
  if (!code && !definition) return undefined;

  const canonical = code ?? `CUSTOM:${fallbackName}`;
  if (canonical === 'EPSG:4326' || canonical === 'EPSG:3857') {
    return { code: canonical, label: canonical, supported: true };
  }

  if (definition && typeof definition === 'string') {
    try {
      proj4.defs(canonical, definition);
      ensureProj4Registered();
      return {
        code: canonical,
        label: canonical,
        supported: true,
      };
    } catch (error) {
      return {
        code: canonical,
        label: canonical,
        supported: false,
        warning: `This layer uses ${canonical}, but the projection could not be registered for map rendering.`,
      };
    }
  }

  return {
    code: canonical,
    label: canonical,
    supported: false,
    warning: `This layer uses ${canonical}, but no projection definition is available for map rendering.`,
  };
}

async function readGeoJsonFeatures(geoPackage: AnyRecord, tableName: string): Promise<FeatureRow[]> {
  const dao = await callMaybe(geoPackage, ['getFeatureDao', 'getFeatureTableDao', 'featureDao'], tableName);
  if (!dao) throw new Error(`No feature DAO found for table ${tableName}.`);

  const geojson =
    await callMaybe(geoPackage, ['queryForGeoJSONFeatures', 'queryForGeoJsonFeatures'], tableName)
    ?? await callMaybe(dao, ['queryForGeoJSONFeatures', 'queryForGeoJsonFeatures'], tableName);

  const parsed = typeof geojson === 'string' ? JSON.parse(geojson) : geojson;

  let features: AnyRecord[] = [];
  if (Array.isArray(parsed?.features)) {
    features = parsed.features;
  } else if (Array.isArray(parsed)) {
    features = parsed;
  } else if (isIterable(parsed)) {
    features = Array.from(parsed) as AnyRecord[];
  }

  if (parsed && typeof (parsed as { close?: () => void }).close === 'function') {
    (parsed as { close: () => void }).close();
  }

  return features.map((feature: AnyRecord, index: number) => normalizeFeature(feature, tableName, index));
}

async function readFeatureTable(geoPackage: AnyRecord, tableName: string): Promise<VectorLayerState> {
  const table = await callMaybe(geoPackage, ['getFeatureDao', 'getFeatureTable', 'featureTable'], tableName) ?? await callMaybe(geoPackage, ['getFeatureDao'], tableName);
  const features = await readGeoJsonFeatures(geoPackage, tableName);
  const crs = readSrsInfo(table ?? {}, tableName);
  const renderable = crs?.supported !== false;
  const warning = renderable ? undefined : crs?.warning;
  return {
    id: tableName,
    name: tableName,
    kind: 'vector',
    visible: true,
    active: false,
    order: 0,
    featureCount: features.length,
    columns: collectColumns(features),
    crs,
    warning,
    features,
    renderable,
  };
}

async function readTileTable(geoPackage: AnyRecord, tableName: string): Promise<TileLayerState> {
  const table = await callMaybe(geoPackage, ['getTileDao', 'getTileTable', 'tileTable'], tableName) ?? await callMaybe(geoPackage, ['getTileDao'], tableName);
  const crs = readSrsInfo(table ?? {}, tableName);
  const count = await callMaybe(table ?? {}, ['count', 'getCount', 'queryForCount']);
  return {
    id: tableName,
    name: tableName,
    kind: 'tile',
    visible: false,
    active: false,
    order: 0,
    tileCount: typeof count === 'number' ? count : undefined,
    crs,
  };
}

export interface ParsedGeoPackageDocument {
  vectorLayers: VectorLayerState[];
  tileLayers: TileLayerState[];
}

export async function parseGeoPackageDocument(bytes: Uint8Array | ArrayBuffer | number[] | { buffer: ArrayBuffer; byteOffset?: number; byteLength?: number }, wasmUri: string): Promise<ParsedGeoPackageDocument> {
  setSqljsWasmLocation(wasmUri);
  const pkg = await openGeoPackage(toUint8Array(bytes));

  const featureTableNames = (await callMaybe(pkg, ['getFeatureTables', 'getFeatureTableNames'])) ?? [];
  const tileTableNames = (await callMaybe(pkg, ['getTileTables', 'getTileTableNames'])) ?? [];

  const vectorLayers = [] as VectorLayerState[];
  for (const tableName of featureTableNames as string[]) {
    vectorLayers.push(await readFeatureTable(pkg, tableName));
  }

  const tileLayers = [] as TileLayerState[];
  for (const tableName of tileTableNames as string[]) {
    tileLayers.push(await readTileTable(pkg, tableName));
  }

  vectorLayers.forEach((layer, index) => {
    layer.order = index;
    layer.active = index === 0;
    layer.visible = true;
  });
  tileLayers.forEach((layer, index) => {
    layer.order = index;
  });

  return { vectorLayers, tileLayers };
}
