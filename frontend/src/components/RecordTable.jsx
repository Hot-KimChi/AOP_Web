import { useMemo } from 'react';

const DISPLAY_LIMIT = 500;

function formatCell(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') {
    return Number.isInteger(value) ? String(value) : String(Number(value.toPrecision(6)));
  }
  if (typeof value === 'boolean') return value ? 'True' : 'False';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/**
 * 레코드 배열 표. `selectable` 이면 `rowKey` 기준 체크박스 선택을 제공한다.
 * 화면 성능을 위해 최대 500행만 그리고 나머지 건수는 안내한다.
 */
export default function RecordTable({
  rows,
  columns,
  rowKey,
  selectable = false,
  selected,
  onToggle,
  onToggleAll,
  emptyText = '데이터가 없습니다.',
  maxHeight = 360,
  testId,
}) {
  const cols = useMemo(() => {
    if (columns && columns.length) return columns;
    const first = rows && rows[0];
    return first ? Object.keys(first) : [];
  }, [columns, rows]);

  if (!rows || rows.length === 0) {
    return <div className="text-muted small py-2" data-testid={testId}>{emptyText}</div>;
  }

  const visible = rows.slice(0, DISPLAY_LIMIT);
  const allSelected = selectable && rows.every((r) => selected?.has(r[rowKey]));

  return (
    <div data-testid={testId}>
      <div style={{ maxHeight, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 6 }}>
        <table className="table table-sm table-hover mb-0" style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
          <thead className="table-light" style={{ position: 'sticky', top: 0, zIndex: 1 }}>
            <tr>
              {selectable && (
                <th style={{ width: 32 }}>
                  <input
                    type="checkbox"
                    aria-label="전체 선택"
                    checked={allSelected}
                    onChange={() => onToggleAll?.(!allSelected)}
                  />
                </th>
              )}
              {cols.map((c) => <th key={c}>{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {visible.map((row, i) => {
              const key = rowKey ? row[rowKey] : i;
              return (
                <tr key={`${key}-${i}`}>
                  {selectable && (
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`${rowKey} ${key} 선택`}
                        checked={selected?.has(key) || false}
                        onChange={() => onToggle?.(key)}
                      />
                    </td>
                  )}
                  {cols.map((c) => <td key={c}>{formatCell(row[c])}</td>)}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="text-muted small mt-1">
        {rows.length > DISPLAY_LIMIT
          ? `${rows.length}행 중 ${DISPLAY_LIMIT}행만 표시합니다.`
          : `${rows.length}행`}
      </div>
    </div>
  );
}
