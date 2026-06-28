import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Spinner, Text } from '@fluentui/react-components';
import { PanelBottomExpand20Regular, PanelLeftExpand20Regular } from '@fluentui/react-icons';
import { Sidebar } from './components/Sidebar';
import { MapView } from './components/MapView';
import { AttributeTable } from './components/AttributeTable';
import { parseGeoPackageDocument } from './services/geopackage';
import { postWebviewMessage } from './services/vscode';
import type { ExtensionMessage } from './types';
import type { DocumentState, VectorLayerState } from './types';

const layerColors = ['#f4a7b9', '#f6c177', '#a8d8b9', '#89c2f7', '#c6b0f5', '#f7b7a3', '#b8e0d2', '#f7d794'];

const initialState: DocumentState = {
  status: 'loading',
  vectorLayers: [],
  tileLayers: [],
  activeItemId: null,
  activeItemKind: null,
  activeLayerId: null,
  selectedFeatureKey: null,
};

export function App() {
  const [state, setState] = useState<DocumentState>(initialState);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [detailsCollapsed, setDetailsCollapsed] = useState(false);
  const [zoomRequest, setZoomRequest] = useState<{ type: 'layer' | 'feature'; id: string; nonce: number } | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(320);
  const [detailsHeight, setDetailsHeight] = useState(300);

  const activeLayer = useMemo(
    () => state.vectorLayers.find((layer) => layer.id === state.activeLayerId) ?? state.vectorLayers[0],
    [state.activeLayerId, state.vectorLayers],
  );

  const activeTileLayer = useMemo(
    () => state.tileLayers.find((layer) => layer.id === state.activeItemId),
    [state.activeItemId, state.tileLayers],
  );

  useEffect(() => {
    const handler = async (event: MessageEvent<ExtensionMessage>) => {
      const message = event.data;

      if (message.type === 'error') {
        setState((prev) => ({ ...prev, status: 'error', error: message.message }));
        return;
      }

      if (message.type !== 'openDocument') return;

      try {
        setState((prev) => ({ ...prev, status: 'loading', error: undefined, fileName: message.file?.name ?? message.fileName ?? prev.fileName }));
        const bytes = message.bytes ?? message.payload?.bytes;
        const wasmUri = message.wasmUri ?? message.payload?.wasmUri;
        if (!bytes || !wasmUri) throw new Error('Missing document bytes or wasmUri.');

        const parsed = await parseGeoPackageDocument(bytes, wasmUri);
        const vectorLayers = parsed.vectorLayers.map((layer, index) => ({
          ...layer,
          active: index === 0,
          visible: true,
          order: index,
          style: {
            color: layerColors[index % layerColors.length],
            opacity: 1,
          },
        }));
        const tileLayers = parsed.tileLayers.map((layer, index) => ({
          ...layer,
          order: index,
        }));

        setState({
          status: 'ready',
          fileName: message.file?.name ?? message.fileName,
          vectorLayers,
          tileLayers,
          activeItemId: vectorLayers[0]?.id ?? tileLayers[0]?.id ?? null,
          activeItemKind: vectorLayers[0] ? 'vector' : tileLayers[0] ? 'tile' : null,
          activeLayerId: vectorLayers[0]?.id ?? null,
          selectedFeatureKey: null,
        });
      } catch (error) {
        const messageText = error instanceof Error ? error.message : 'Unable to open GeoPackage.';
        setState((prev) => ({ ...prev, status: 'error', error: messageText }));
      }
    };

    const messageHandler: EventListener = (event) => {
      void handler(event as MessageEvent<ExtensionMessage>);
    };

    window.addEventListener('message', messageHandler);
    postWebviewMessage({ type: 'ready' });
    return () => window.removeEventListener('message', messageHandler);
  }, []);

  const updateVectorLayers = (updater: (layers: VectorLayerState[]) => VectorLayerState[]) => {
    setState((prev) => {
      const nextLayers = updater(prev.vectorLayers);
      const active = nextLayers.find((layer) => layer.id === prev.activeLayerId) ?? nextLayers[0] ?? null;
      return { ...prev, vectorLayers: nextLayers, activeLayerId: active?.id ?? null };
    });
  };

  const handleToggleVisible = (layerId: string) => {
    updateVectorLayers((layers) => layers.map((layer) => (layer.id === layerId ? { ...layer, visible: !layer.visible } : layer)));
  };

  const handleMoveLayer = (layerId: string, direction: -1 | 1) => {
    updateVectorLayers((layers) => {
      const index = layers.findIndex((layer) => layer.id === layerId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= layers.length) return layers;
      const next = [...layers];
      [next[index], next[target]] = [next[target], next[index]];
      return next.map((layer, order) => ({ ...layer, order }));
    });
  };

  const handleUpdateLayerStyle = useCallback((layerId: string, style: { color?: string; opacity?: number }) => {
    updateVectorLayers((layers) => layers.map((layer) => (
      layer.id === layerId
        ? {
            ...layer,
            style: {
              ...layer.style,
              ...style,
            },
          }
        : layer
    )));
  }, []);

  const handleActivateItem = (itemId: string, kind: 'vector' | 'tile') => {
    setState((prev) => ({
      ...prev,
      activeItemId: itemId,
      activeItemKind: kind,
      activeLayerId: kind === 'vector' ? itemId : prev.activeLayerId,
    }));
  };

  const handleSelectionChange = useCallback(({ layerId, featureKey }: { layerId: string | null; featureKey: string | null }) => {
    setState((prev) => ({
      ...prev,
      activeLayerId: layerId ?? prev.activeLayerId,
      activeItemId: layerId ?? prev.activeItemId,
      activeItemKind: layerId ? 'vector' : prev.activeItemKind,
      selectedFeatureKey: featureKey,
    }));
  }, []);

  const handleZoomToLayer = useCallback((layerId: string) => {
    setZoomRequest({ type: 'layer', id: layerId, nonce: Date.now() });
  }, []);

  const handleZoomToFeature = useCallback((featureKey: string) => {
    setState((prev) => ({
      ...prev,
      selectedFeatureKey: featureKey,
    }));
    setZoomRequest({ type: 'feature', id: featureKey, nonce: Date.now() });
  }, []);

  const handleShowDetails = useCallback((itemId: string, kind: 'vector' | 'tile') => {
    handleActivateItem(itemId, kind);
    setDetailsCollapsed(false);
  }, []);

  const unsupportedLayers = state.vectorLayers.filter((layer) => layer.crs && !layer.crs.supported);
  const showMapOverlay = state.status === 'loading' || state.status === 'error' || unsupportedLayers.length > 0;

  const startSidebarResize = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = sidebarWidth;

    const handleMove = (moveEvent: PointerEvent) => {
      const nextWidth = Math.min(520, Math.max(220, startWidth + (moveEvent.clientX - startX)));
      setSidebarWidth(nextWidth);
    };

    const handleUp = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  }, [sidebarWidth]);

  const startDetailsResize = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = detailsHeight;

    const handleMove = (moveEvent: PointerEvent) => {
      const nextHeight = Math.min(420, Math.max(180, startHeight - (moveEvent.clientY - startY)));
      setDetailsHeight(nextHeight);
    };

    const handleUp = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  }, [detailsHeight]);

  return (
    <div className="appShell">
      <div
        className={sidebarCollapsed ? 'layout sidebarCollapsed' : 'layout'}
        style={sidebarCollapsed ? undefined : { ['--sidebar-width' as string]: `${sidebarWidth}px` }}
      >
        {!sidebarCollapsed ? (
          <Sidebar
            fileName={state.fileName}
            vectorLayers={state.vectorLayers}
            tileLayers={state.tileLayers}
            activeItemId={state.activeItemId}
            activeItemKind={state.activeItemKind}
            onToggleVisible={handleToggleVisible}
            onMoveLayer={handleMoveLayer}
            onUpdateLayerStyle={handleUpdateLayerStyle}
            onActivateItem={handleActivateItem}
            onZoomToLayer={handleZoomToLayer}
            onShowDetails={handleShowDetails}
            collapsed={sidebarCollapsed}
            onToggleCollapsed={() => setSidebarCollapsed((value) => !value)}
          />
        ) : null}
        {!sidebarCollapsed ? <div className="paneResizer vertical" onPointerDown={startSidebarResize} /> : null}

        <main
          className={detailsCollapsed ? 'workspace detailsCollapsed' : 'workspace'}
          style={detailsCollapsed ? undefined : { ['--details-height' as string]: `${detailsHeight}px` }}
        >
          <section className="mapCard">
            <MapView
              layers={state.vectorLayers}
              selectedFeatureKey={state.selectedFeatureKey}
              onSelectionChange={handleSelectionChange}
              onShowDetails={handleShowDetails}
              layoutCollapsed={detailsCollapsed}
              zoomRequest={zoomRequest}
            />
            {showMapOverlay ? (
              <div className="mapOverlay">
                {state.status === 'loading' ? <div className="notice mapNotice"><Spinner label="Loading GeoPackage…" /></div> : null}
                {state.status === 'error' ? <div className="notice mapNotice error"><Text weight="semibold">Could not open document</Text><div>{state.error}</div></div> : null}
                {unsupportedLayers.length > 0 ? <div className="notice mapNotice warning"><Text weight="semibold">Some layers were not rendered</Text><div>{unsupportedLayers.map((layer) => `${layer.name} (${layer.crs?.label ?? 'unknown'})`).join(', ')}</div></div> : null}
              </div>
            ) : null}
            {sidebarCollapsed ? (
              <Button
                className="sidebarReopenButton blackIconButton"
                appearance="subtle"
                icon={<PanelLeftExpand20Regular />}
                onClick={() => setSidebarCollapsed(false)}
              />
            ) : null}
            {detailsCollapsed ? (
              <Button
                className="detailsReopenButton blackIconButton"
                appearance="subtle"
                icon={<PanelBottomExpand20Regular />}
                onClick={() => setDetailsCollapsed(false)}
              />
            ) : null}
          </section>

          {!detailsCollapsed ? (
            <>
              <div className="paneResizer horizontal" onPointerDown={startDetailsResize} />
              <AttributeTable
                layer={state.activeItemKind === 'vector' ? activeLayer : undefined}
                tileLayer={activeTileLayer}
                onToggleCollapsed={() => setDetailsCollapsed(true)}
                onSelectFeature={(featureKey) => setState((prev) => ({ ...prev, selectedFeatureKey: featureKey }))}
                onZoomToFeature={handleZoomToFeature}
                selectedFeatureKey={state.selectedFeatureKey}
              />
            </>
          ) : null}
        </main>
      </div>
    </div>
  );
}
