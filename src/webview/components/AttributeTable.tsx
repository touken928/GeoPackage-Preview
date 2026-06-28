import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Text } from '@fluentui/react-components';
import { PanelBottomExpand20Regular, PanelBottomContract20Regular, ZoomFit20Regular } from '@fluentui/react-icons';
import type { AttributesTableState, FeatureRow, TileLayerState, VectorLayerState } from '../types';

interface AttributeTableProps {
  layer: VectorLayerState | undefined;
  tileLayer: TileLayerState | undefined;
  attributeTable: AttributesTableState | undefined;
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

function searchValue(featureId: string, value: unknown, key: SortKey): string {
  return key === 'id' ? displayFeatureId(featureId) : formatValue(value);
}

export function AttributeTable({
  layer,
  tileLayer,
  attributeTable,
  onToggleCollapsed,
  onSelectFeature,
  onZoomToFeature,
  selectedFeatureKey,
}: AttributeTableProps) {
  const rows: FeatureRow[] = layer?.features ?? attributeTable?.rows ?? [];
  const columns = layer?.columns ?? attributeTable?.columns ?? [];
  const title = layer?.name ?? attributeTable?.name ?? tileLayer?.name ?? 'Details';
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; featureKey: string } | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('id');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [searchColumn, setSearchColumn] = useState<SortKey>('id');
  const [searchQuery, setSearchQuery] = useState('');
  const selectedRowRef = useRef<HTMLTableRowElement | null>(null);

  useEffect(() => {
    setSortKey('id');
    setSortDirection('asc');
    setSearchColumn('id');
    setSearchQuery('');
  }, [attributeTable?.id, layer?.id]);

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
    selectedRowRef.current?.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
    });
  }, [selectedFeatureKey]);

  const searchRegex = useMemo(() => {
    if (!searchQuery) return null;

    try {
      return new RegExp(searchQuery, 'i');
    } catch {
      return null;
    }
  }, [searchQuery]);

  const hasInvalidRegex = searchQuery.length > 0 && searchRegex == null;

  const filteredFeatures = useMemo(() => {
    if (!searchQuery) return rows;
    if (hasInvalidRegex) return [];

    return rows.filter((row) => {
      const rawValue = searchColumn === 'id' ? undefined : row.properties[searchColumn];
      const text = searchValue(row.id, rawValue, searchColumn);
      return searchRegex?.test(text) ?? false;
    });
  }, [hasInvalidRegex, rows, searchColumn, searchQuery, searchRegex]);

  const sortedFeatures = useMemo(() => {
    return filteredFeatures
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
  }, [filteredFeatures, sortDirection, sortKey]);

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
    <section className="detailsPane">
      <div className="detailsHeader">
        <div className="detailsHeaderContent">
          <div className="detailsTitleRow">
            <Text className="detailsTitleText" weight="semibold">{title}</Text>
            {(layer || attributeTable) ? <span className="detailsCount">{rows.length} rows</span> : null}
          </div>
          {tileLayer ? <div className="detailsMeta">Tile table metadata only</div> : null}
          {attributeTable ? <div className="detailsMeta">Non-spatial attribute table</div> : null}
          {!layer && !tileLayer && !attributeTable ? <div className="detailsMeta">Choose a layer to inspect it.</div> : null}
        </div>
        <Button appearance="subtle" icon={<PanelBottomContract20Regular />} onClick={onToggleCollapsed} />
      </div>

      {layer || attributeTable ? (
        <>
          <div className="detailsBody">
            <div className="tableToolbar">
              <label className="tableToolbarField">
                <span className="tableToolbarLabel">Column</span>
                <select className="tableToolbarSelect" value={searchColumn} onChange={(event) => setSearchColumn(event.target.value)}>
                  <option value="id">Feature id</option>
                  {columns.map((column) => <option key={column} value={column}>{column}</option>)}
                </select>
              </label>
              <label className="tableToolbarField tableToolbarSearchField">
                <span className="tableToolbarLabel">Search</span>
                <input
                  className="tableToolbarInput"
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Enter regular expression"
                />
              </label>
            </div>
            {hasInvalidRegex ? <div className="tableToolbarMessage error">Invalid regular expression.</div> : null}
            {searchQuery && !hasInvalidRegex ? <div className="tableToolbarMessage">{sortedFeatures.length} matches</div> : null}
            <div className="tableScroll" aria-label="GeoPackage attributes">
              <table className="attrTable">
                <thead>
                  <tr>
                    <th className="fixedCol">{renderSortLabel('id', 'Feature id')}</th>
                    {columns.map((column) => <th key={column}>{renderSortLabel(column, column)}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {sortedFeatures.map((row) => {
                    const selected = row.id === selectedFeatureKey;
                    return (
                      <tr
                        key={row.id}
                        className={selected ? 'selectedRow' : ''}
                        ref={selected ? selectedRowRef : undefined}
                        onClick={() => onSelectFeature(row.id)}
                        onContextMenu={(event) => {
                          event.preventDefault();
                          setContextMenu({ x: event.clientX, y: event.clientY, featureKey: row.id });
                        }}
                      >
                        <td className="fixedCol">{displayFeatureId(row.id)}</td>
                        {columns.map((column) => <td key={column}>{formatValue(row.properties[column])}</td>)}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
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
