import { useEffect, useMemo, useRef } from 'react';
import GeoJSON from 'ol/format/GeoJSON';
import OlMap from 'ol/Map';
import OSM from 'ol/source/OSM';
import TileLayer from 'ol/layer/Tile';
import View from 'ol/View';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { defaults as defaultControls } from 'ol/control';
import { extend, isEmpty as isEmptyExtent } from 'ol/extent';
import { Fill, Stroke, Style, Circle as CircleStyle } from 'ol/style';
import { defaults as defaultInteractions } from 'ol/interaction';
import Select from 'ol/interaction/Select';
import type { FeatureLike } from 'ol/Feature';
import type { VectorLayerState } from '../types';

interface MapViewProps {
  layers: VectorLayerState[];
  selectedFeatureKey: string | null;
  zoomRequest: { type: 'layer' | 'feature'; id: string; nonce: number } | null;
  onSelectionChange: (selection: { layerId: string | null; featureKey: string | null }) => void;
  onShowDetails: (itemId: string, kind: 'vector' | 'tile') => void;
  layoutCollapsed: boolean;
}

function createStyle(selected: boolean) {
  return new Style({
    fill: new Fill({ color: selected ? 'rgba(32, 136, 255, 0.26)' : 'rgba(89, 155, 255, 0.16)' }),
    stroke: new Stroke({ color: selected ? '#1976d2' : '#4b6ea8', width: selected ? 3 : 1.5 }),
    image: new CircleStyle({
      radius: selected ? 7 : 5,
      fill: new Fill({ color: selected ? '#1976d2' : '#5c7ea6' }),
      stroke: new Stroke({ color: '#ffffff', width: 1.25 }),
    }),
  });
}

function featureId(feature: FeatureLike): string | null {
  return feature.getId() != null ? String(feature.getId()) : feature.get('featureKey') ?? null;
}

export function MapView({ layers, selectedFeatureKey, zoomRequest, onSelectionChange, onShowDetails, layoutCollapsed }: MapViewProps) {
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<OlMap | null>(null);
  const layerMapRef = useRef<globalThis.Map<string, VectorLayer<VectorSource>>>(new globalThis.Map());
  const selectRef = useRef<Select | null>(null);
  // Keep latest onSelectionChange in a ref so Effect 1 doesn't need it in deps.
  const onSelectionChangeRef = useRef(onSelectionChange);
  onSelectionChangeRef.current = onSelectionChange;
  const onShowDetailsRef = useRef(onShowDetails);
  onShowDetailsRef.current = onShowDetails;

  const visibleLayers = useMemo(() => layers.filter((layer) => layer.visible && layer.renderable), [layers]);

  // ── Effect 1: create map once ──────────────────────────────────────────
  useEffect(() => {
    if (!mapElementRef.current || mapRef.current) return;

    const target = mapElementRef.current;

    const select = new Select({
      style: () => createStyle(true),
    });
    select.on('select', (event) => {
      const feature = event.selected[0];
      if (!feature) return;
      const id = featureId(feature);
      const layerId = String(feature.get('layerId') ?? null);
      if (!id) return;
      onSelectionChangeRef.current({
        layerId,
        featureKey: id,
      });
      if (layerId && layerId !== 'null') {
        onShowDetailsRef.current(layerId, 'vector');
      }
    });

    const map = new OlMap({
      target,
      controls: defaultControls({
        zoom: false,
        attribution: false,
        rotate: false,
      }),
      interactions: defaultInteractions().extend([select]),
      layers: [
        new TileLayer({
          source: new OSM(),
        }),
      ],
      view: new View({
        center: [0, 0],
        zoom: 2,
      }),
    });

    const viewport = map.getViewport();
    const handleContextMenu = (event: MouseEvent) => {
      event.preventDefault();
      const pixel = map.getEventPixel(event);
      const feature = map.forEachFeatureAtPixel(pixel, (candidate) => candidate);
      if (!feature) return;

      const id = featureId(feature);
      const layerId = String(feature.get('layerId') ?? '');
      if (!id || !layerId) return;

      onSelectionChangeRef.current({
        layerId,
        featureKey: id,
      });
      onShowDetailsRef.current(layerId, 'vector');
    };

    viewport.addEventListener('contextmenu', handleContextMenu);

    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        map.updateSize();
      });
    });
    resizeObserver.observe(target);

    mapRef.current = map;
    selectRef.current = select;

    return () => {
      resizeObserver.disconnect();
      viewport.removeEventListener('contextmenu', handleContextMenu);
      map.setTarget(undefined);
      mapRef.current = null;
      selectRef.current = null;
    };
  }, []); // stable — the ref avoids stale onSelectionChange

  // ── Effect 2: rebuild vector layers when visible layers change ─────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const existing = layerMapRef.current;

    // Remove previous vector layers.
    existing.forEach((layer) => map.removeLayer(layer));
    existing.clear();

    let featureExtent: [number, number, number, number] | null = null;

    for (const [renderIndex, layer] of visibleLayers.entries()) {
      const source = new VectorSource();
      const format = new GeoJSON();
      const features = format.readFeatures(
        {
          type: 'FeatureCollection',
          features: layer.features.map((feature) => ({
            type: 'Feature',
            id: feature.id,
            geometry: feature.geometry,
            properties: {
              ...feature.properties,
              featureKey: feature.id,
              layerId: layer.id,
            },
          })),
        },
        {
          // GeoPackage library (queryForGeoJSONFeatures) always reprojects
          // feature geometry to WGS84 (EPSG:4326) per the GeoJSON spec.
          dataProjection: 'EPSG:4326',
          featureProjection: 'EPSG:3857',
        },
      );

      features.forEach((feature) => {
        const key = String(feature.getId() ?? feature.get('featureKey'));
        feature.setId(key);
        feature.set('layerId', layer.id);
        if (!feature.get('featureKey')) feature.set('featureKey', key);
      });

      source.addFeatures(features);

      const extent = source.getExtent();
      if (extent && !isEmptyExtent(extent)) {
        featureExtent = featureExtent ? extend(featureExtent, extent) as [number, number, number, number] : (extent as [number, number, number, number]);
      }

      const vectorLayer = new VectorLayer({
        source,
        zIndex: 1000 - renderIndex,
        style: () => createStyle(false),
      });

      existing.set(layer.id, vectorLayer);
      map.addLayer(vectorLayer);
    }

    // Fit extent on initial layer load (not on selection-only changes).
    if (featureExtent && !isEmptyExtent(featureExtent)) {
      map.getView().fit(featureExtent, { padding: [24, 24, 24, 24], duration: 250, maxZoom: 17 });
    }
  }, [visibleLayers]);

  // ── Effect 3: update selection highlight when selectedFeatureKey changes
  useEffect(() => {
    const map = mapRef.current;
    const select = selectRef.current;
    if (!map || !select) return;

    if (!selectedFeatureKey) {
      select.getFeatures().clear();
      map.render();
      return;
    }

    // Find the feature across all visible layers.
    for (const layer of visibleLayers) {
      const vectorLayer = layerMapRef.current.get(layer.id);
      if (!vectorLayer) continue;
      const feature = vectorLayer.getSource()?.getFeatureById(selectedFeatureKey);
      if (feature) {
        select.getFeatures().clear();
        select.getFeatures().push(feature);
        map.render();
        return;
      }
    }

    // Not found in any visible layer.
    select.getFeatures().clear();
    map.render();
  }, [selectedFeatureKey]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !zoomRequest) return;

    if (zoomRequest.type === 'feature') {
      for (const layer of visibleLayers) {
        const vectorLayer = layerMapRef.current.get(layer.id);
        const feature = vectorLayer?.getSource()?.getFeatureById(zoomRequest.id);
        const geometry = feature?.getGeometry();
        if (geometry && !isEmptyExtent(geometry.getExtent())) {
          map.getView().fit(geometry.getExtent(), { padding: [40, 40, 40, 40], duration: 250, maxZoom: 18 });
          return;
        }
      }
    }

    if (zoomRequest.type === 'layer') {
      const vectorLayer = layerMapRef.current.get(zoomRequest.id);
      const extent = vectorLayer?.getSource()?.getExtent();
      if (extent && !isEmptyExtent(extent)) {
        map.getView().fit(extent, { padding: [40, 40, 40, 40], duration: 250, maxZoom: 18 });
      }
    }
  }, [zoomRequest, visibleLayers]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        map.updateSize();
      });
    });
  }, [layoutCollapsed]);

  return <div ref={mapElementRef} className="mapViewport" />;
}
