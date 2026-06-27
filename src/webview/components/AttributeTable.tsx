import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Text } from '@fluentui/react-components';
import { PanelBottomExpand20Regular, PanelBottomContract20Regular, ZoomFit20Regular } from '@fluentui/react-icons';
import type { TileLayerState, VectorLayerState } from '../types';

interface AttributeTableProps {
  layer: VectorLayerState | undefined;
  tileLayer: TileLayerState | undefined;
  collapsed: boolean;
  height: number;
  onToggleCollapsed: () => void;
  onSelectFeature: (featureKey: string) => void;
  onZoomToFeature: (featureKey: string) => void;
  selectedFeatureKey: string | null;
}

type SortKey = 'id' | string;
type SortDirection = 'asc' | 'desc';

function displayFeatureId(featureId: string): string {
  const separatorIndex = featureId.indexOf(':');
  return separatorIndex >= 0 ? featureId.slice(separatorIndex + 1) : featureId;
}

function formatValue(value: unknown): string {
  if (value == null) return '—';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(formatValue).join(', ');
  return JSON.stringify(value);
}

function compareUnknownValues(left: unknown, right: unknown): number {
  if (left == null && right == null) return 0;
  if (left == null) return 1;
  if (right == null) return -1;

  if (typeof left === 'number' && typeof right === 'number') {
    return left - right;
  }

  if (typeof left === 'boolean' && typeof right === 'boolean') {
    return Number(left) - Number(right);
  }

  const leftText = typeof left === 'string' ? left : formatValue(left);
  const rightText = typeof right === 'string' ? right : formatValue(right);
  return leftText.localeCompare(rightText, undefined, { numeric: true, sensitivity: 'base' });
}

export function AttributeTable({
  layer,
  tileLayer,
  collapsed,
  height,
  onToggleCollapsed,
  onSelectFeature,
  onZoomToFeature,
  selectedFeatureKey,
}: AttributeTableProps) {
  const features = layer?.features ?? [];
  const columns = layer?.columns ?? [];
  const title = layer?.name ?? tileLayer?.name ?? 'Details';
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; featureKey: string } | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('id');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const selectedRowRef = useRef<HTMLTableRowElement | null>(null);

  useEffect(() => {
    setSortKey('id');
    setSortDirection('asc');
  }, [layer?.id]);

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

  useEffect(() => {
    if (collapsed) return;

    selectedRowRef.current?.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
    });
  }, [collapsed, selectedFeatureKey]);

  const sortedFeatures = useMemo(() => {
    return features
      .map((feature, index) => ({ feature, index }))
      .sort((left, right) => {
        const leftValue = sortKey === 'id' ? displayFeatureId(left.feature.id) : left.feature.properties[sortKey];
        const rightValue = sortKey === 'id' ? displayFeatureId(right.feature.id) : right.feature.properties[sortKey];
        const result = compareUnknownValues(leftValue, rightValue);

        if (result !== 0) {
          return sortDirection === 'asc' ? result : -result;
        }

        return left.index - right.index;
      })
      .map(({ feature }) => feature);
  }, [features, sortDirection, sortKey]);

  const handleSort = (nextKey: SortKey) => {
    if (sortKey === nextKey) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }

    setSortKey(nextKey);
    setSortDirection('asc');
  };

  const renderSortLabel = (key: SortKey, label: string) => {
    const active = sortKey === key;
    const indicator = !active ? '↕' : sortDirection === 'asc' ? '↑' : '↓';

    return (
      <button className={active ? 'sortButton active' : 'sortButton'} type="button" onClick={() => handleSort(key)}>
        <span>{label}</span>
        <span className="sortIndicator" aria-hidden="true">{indicator}</span>
      </button>
    );
  };

  return (
    <section className={collapsed ? 'detailsPane collapsed' : 'detailsPane'} style={collapsed ? undefined : { flexBasis: `${height}px` }}>
      <div className="detailsHeader">
        <div>
          <Text weight="semibold">{title}</Text>
          <div className="detailsMeta">
            {layer ? `${features.length} rows` : tileLayer ? 'Tile table metadata only' : 'Choose a layer to inspect it.'}
          </div>
        </div>
        <Button appearance="subtle" icon={collapsed ? <PanelBottomExpand20Regular /> : <PanelBottomContract20Regular />} onClick={onToggleCollapsed} />
      </div>

      {collapsed ? null : layer ? (
        <div className="tableScroll" aria-label="GeoPackage attributes">
          <table className="attrTable">
            <thead>
              <tr>
                <th className="fixedCol">{renderSortLabel('id', 'Feature id')}</th>
                {columns.map((column) => <th key={column}>{renderSortLabel(column, column)}</th>)}
              </tr>
            </thead>
            <tbody>
              {sortedFeatures.map((feature) => {
                const selected = feature.id === selectedFeatureKey;
                return (
                  <tr
                    key={feature.id}
                    className={selected ? 'selectedRow' : ''}
                    ref={selected ? selectedRowRef : undefined}
                    onClick={() => onSelectFeature(feature.id)}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      setContextMenu({ x: event.clientX, y: event.clientY, featureKey: feature.id });
                    }}
                  >
                    <td className="fixedCol">{displayFeatureId(feature.id)}</td>
                    {columns.map((column) => <td key={column}>{formatValue(feature.properties[column])}</td>)}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="emptyState">Open a layer to inspect rows.</div>
      )}
      {contextMenu ? (
        <div className="floatingMenu" style={{ left: contextMenu.x, top: contextMenu.y }} onMouseLeave={() => setContextMenu(null)}>
          <button className="floatingMenuItem" onClick={() => { onZoomToFeature(contextMenu.featureKey); setContextMenu(null); }}>
            <ZoomFit20Regular />
            <span>Zoom to selected feature</span>
          </button>
        </div>
      ) : null}
    </section>
  );
}
