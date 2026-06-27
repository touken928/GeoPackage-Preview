import { useEffect, useMemo, useState } from 'react';
import { Button, Checkbox, Text } from '@fluentui/react-components';
import { ChevronDown16Regular, ChevronUp16Regular, PanelLeftExpand20Regular, PanelLeftContract20Regular, ZoomFit20Regular, Table20Regular, Layer20Regular, Database20Regular } from '@fluentui/react-icons';
import type { TileLayerState, VectorLayerState } from '../types';

interface SidebarProps {
  fileName?: string;
  vectorLayers: VectorLayerState[];
  tileLayers: TileLayerState[];
  activeItemId: string | null;
  activeItemKind: 'vector' | 'tile' | null;
  onToggleVisible: (layerId: string) => void;
  onMoveLayer: (layerId: string, direction: -1 | 1) => void;
  onActivateItem: (itemId: string, kind: 'vector' | 'tile') => void;
  onZoomToLayer: (layerId: string) => void;
  onShowDetails: (itemId: string, kind: 'vector' | 'tile') => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

export function Sidebar({
  fileName,
  vectorLayers,
  tileLayers,
  activeItemId,
  activeItemKind,
  onToggleVisible,
  onMoveLayer,
  onActivateItem,
  onZoomToLayer,
  onShowDetails,
  collapsed,
  onToggleCollapsed,
}: SidebarProps) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; id: string; kind: 'vector' | 'tile' } | null>(null);

  useEffect(() => {
    if (!contextMenu) return;

    const handleClose = () => setContextMenu(null);
    window.addEventListener('click', handleClose);
    window.addEventListener('blur', handleClose);
    return () => {
      window.removeEventListener('click', handleClose);
      window.removeEventListener('blur', handleClose);
    };
  }, [contextMenu]);

  const contextLayer = useMemo(() => {
    if (!contextMenu) return null;
    return contextMenu.kind === 'vector'
      ? vectorLayers.find((item) => item.id === contextMenu.id)
      : tileLayers.find((item) => item.id === contextMenu.id);
  }, [contextMenu, vectorLayers, tileLayers]);

  if (collapsed) {
    return (
      <aside className="sidebarPanel collapsed">
        <div className="sidebarCollapsedWrap">
          <Button appearance="subtle" size="small" icon={<PanelLeftExpand20Regular />} onClick={onToggleCollapsed} />
        </div>
      </aside>
    );
  }

  return (
    <aside className="sidebarPanel">
      <div className="sidebarHeader">
        <div>
          <Text weight="semibold">{fileName ?? 'Untitled document'}</Text>
          <div className="sidebarMeta">GeoPackage layers</div>
        </div>
        <Button appearance="subtle" size="small" icon={<PanelLeftContract20Regular />} onClick={onToggleCollapsed} />
      </div>

      <div className="sidebarList">
        {vectorLayers.length === 0 && tileLayers.length === 0 ? <div className="sidebarEmpty">No layers found</div> : null}
        {vectorLayers.map((layer, index) => {
          const active = activeItemKind === 'vector' && activeItemId === layer.id;
          return (
            <div
              key={layer.id}
              className={['sidebarCard', active ? 'active' : '', !layer.visible ? 'muted' : ''].filter(Boolean).join(' ')}
              onClick={() => onActivateItem(layer.id, 'vector')}
              onContextMenu={(event) => {
                event.preventDefault();
                setContextMenu({ x: event.clientX, y: event.clientY, id: layer.id, kind: 'vector' });
              }}
              role="button"
              tabIndex={0}
            >
              <div className="sidebarCardBody">
                <div className="sidebarCardTitleRow">
                  <Checkbox checked={layer.visible} onClick={(e) => e.stopPropagation()} onChange={() => onToggleVisible(layer.id)} />
                  <Layer20Regular />
                  <Text weight="semibold">{layer.name}</Text>
                </div>
                <div className="sidebarCardMeta">
                  <span className="layerBadge vector">Vector</span>
                  <span>{layer.featureCount ?? 0} rows</span>
                  <span>{layer.crs?.label ?? 'CRS unknown'}</span>
                </div>
              </div>
              <div className="sidebarActions">
                <Button size="small" appearance="subtle" icon={<ChevronUp16Regular />} disabled={index === 0} onClick={(e) => { e.stopPropagation(); onMoveLayer(layer.id, -1); }} />
                <Button size="small" appearance="subtle" icon={<ChevronDown16Regular />} disabled={index === vectorLayers.length - 1} onClick={(e) => { e.stopPropagation(); onMoveLayer(layer.id, 1); }} />
              </div>
            </div>
          );
        })}

        {tileLayers.map((layer) => {
          const active = activeItemKind === 'tile' && activeItemId === layer.id;
          return (
            <div
              key={layer.id}
              className={['sidebarCard', active ? 'active' : ''].filter(Boolean).join(' ')}
              onClick={() => onActivateItem(layer.id, 'tile')}
              onContextMenu={(event) => {
                event.preventDefault();
                setContextMenu({ x: event.clientX, y: event.clientY, id: layer.id, kind: 'tile' });
              }}
              role="button"
              tabIndex={0}
            >
              <div className="sidebarCardBody">
                <div className="sidebarCardTitleRow">
                  <Database20Regular />
                  <Text weight="semibold">{layer.name}</Text>
                </div>
                <div className="sidebarCardMeta">
                  <span className="layerBadge tile">Tile</span>
                  <span>{layer.tileCount ?? 0} tiles</span>
                  <span>Metadata only</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {contextMenu && contextLayer ? (
        <div className="floatingMenu" style={{ left: contextMenu.x, top: contextMenu.y }} onMouseLeave={() => setContextMenu(null)}>
          {contextMenu.kind === 'vector' ? (
            <button className="floatingMenuItem" onClick={() => { onZoomToLayer(contextMenu.id); setContextMenu(null); }}>
              <ZoomFit20Regular />
              <span>Zoom to layer</span>
            </button>
          ) : null}
          <button className="floatingMenuItem" onClick={() => { onShowDetails(contextMenu.id, contextMenu.kind); setContextMenu(null); }}>
            <Table20Regular />
            <span>Show in details</span>
          </button>
        </div>
      ) : null}
    </aside>
  );
}
