'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { Thermometer, Scale, Droplet, HelpCircle, Network, X } from 'lucide-react';

/**
 * GroupIndex별 데이터 관계도(Temperature / Power / Intensity)를 보여주는 모달.
 * @param {{ isOpen: boolean, onClose: () => void, data: object[] }} props
 */
export default function DataPreviewModal({ isOpen, onClose, data }) {
  const [expandedGroups, setExpandedGroups] = useState(new Set());
  const [expandAll, setExpandAll] = useState(false);

  // ESC 키로 모달 닫기
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // 모달 열림 시 body 스크롤 잠금
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  // GroupIndex 키 이름 정규화
  const resolveGroupIndex = useCallback((row) => {
    for (const key of ['GroupIndex', 'groupIndex', 'groupindex', 'GROUPINDEX']) {
      if (row[key] !== undefined) return String(row[key]);
    }
    return null;
  }, []);

  // measSetComments 카테고리 분류
  const categorize = useCallback((comment) => {
    const lower = (comment || '').toLowerCase();
    if (lower.includes('temperature_sa') || lower.includes('temperature sa')) return 'temperature_sa';
    if (lower.includes('temperature')) return 'temperature';
    if (lower.includes('power')) return 'power';
    if (lower.includes('intensity')) return 'intensity';
    return 'unknown';
  }, []);

  // 컬럼값 안전하게 읽기 (별칭 지원)
  const col = useCallback((row, ...keys) => {
    for (const k of keys) {
      if (row[k] !== undefined && row[k] !== null && row[k] !== '') return row[k];
    }
    return '-';
  }, []);

  // 데이터 그룹핑 (useMemo)
  const { groups, sortedKeys, summary } = useMemo(() => {
    if (!data || data.length === 0) {
      return { groups: {}, sortedKeys: [], summary: { totalRows: 0, totalGroups: 0, intensity: 0, power: 0, temperature: 0, temperature_sa: 0, unknown: 0 } };
    }

    const grp = {};
    const counts = { intensity: 0, power: 0, temperature: 0, temperature_sa: 0, unknown: 0 };

    data.forEach((row) => {
      const gIdx = resolveGroupIndex(row);
      if (gIdx === null) return;

      if (!grp[gIdx]) grp[gIdx] = { intensity: [], power: [], temperature: [], temperature_sa: [], unknown: [] };

      const cat = categorize(row.measSetComments);
      grp[gIdx][cat].push(row);
      counts[cat]++;
    });

    const keys = Object.keys(grp).sort((a, b) => Number(a) - Number(b));

    return {
      groups: grp,
      sortedKeys: keys,
      summary: { totalRows: data.length, totalGroups: keys.length, ...counts },
    };
  }, [data, resolveGroupIndex, categorize]);

  const toggleGroup = useCallback((key) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  const handleToggleAll = useCallback(() => {
    if (expandAll) {
      setExpandedGroups(new Set());
    } else {
      setExpandedGroups(new Set(sortedKeys));
    }
    setExpandAll((v) => !v);
  }, [expandAll, sortedKeys]);

  if (!isOpen) return null;

  // 타입별 표시 설정
  const typeConfig = {
    temperature:    { Icon: Thermometer, label: 'Temperature',    cls: 'dp-type-temp' },
    temperature_sa: { Icon: Thermometer, label: 'Temperature SA', cls: 'dp-type-tempsa' },
    power:          { Icon: Scale,       label: 'Power',          cls: 'dp-type-power' },
    intensity:      { Icon: Droplet,     label: 'Intensity',      cls: 'dp-type-intensity' },
    unknown:        { Icon: HelpCircle,  label: 'Unknown',        cls: 'dp-type-unknown' },
  };

  const renderMiniTable = (rows, type) => {
    if (rows.length === 0) return null;
    const cfg = typeConfig[type];

    return (
      <div className={`dp-type-section ${cfg.cls}`} key={type}>
        <div className="dp-type-header">
          <cfg.Icon size={13} className="dp-type-icon" />{cfg.label}
          <span className="dp-type-count">{rows.length}</span>
        </div>
        <div className="dp-table-wrap">
          <table className="dp-mini-table">
            <thead>
              <tr>
                <th>Focus (cm)</th>
                <th>AI_param</th>
                <th>Freq (Hz)</th>
                <th>Elements</th>
                <th>Cycles</th>
                <th>Voltage (V)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i}>
                  <td>{col(row, 'focusRangeCm', 'TxFocusLocCm')}</td>
                  <td className="dp-ai-value">{col(row, 'AI_param')}</td>
                  <td>{col(row, 'TxFrequencyHz')}</td>
                  <td>{col(row, 'NumTxElements')}</td>
                  <td>{col(row, 'numTxCycles', 'ProbeNumTxCycles')}</td>
                  <td>{col(row, 'profTxVoltageVolt')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="dp-overlay" onClick={onClose}>
      <div className="dp-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="dp-header">
          <h5 className="dp-title"><Network size={16} className="card-title-icon" />Data Preview — 데이터 관계도</h5>
          <button className="dp-close-btn" onClick={onClose} aria-label="닫기"><X size={16} /></button>
        </div>

        {/* Summary Bar */}
        <div className="dp-summary">
          <span className="dp-summary-chip">전체 <strong>{summary.totalRows}</strong> rows</span>
          <span className="dp-summary-chip">그룹 <strong>{summary.totalGroups}</strong></span>
          <span className="dp-summary-chip dp-chip-intensity"><Droplet size={12} /> Intensity <strong>{summary.intensity}</strong></span>
          <span className="dp-summary-chip dp-chip-power"><Scale size={12} /> Power <strong>{summary.power}</strong></span>
          <span className="dp-summary-chip dp-chip-temp"><Thermometer size={12} /> Temp <strong>{summary.temperature}</strong></span>
          {summary.temperature_sa > 0 && (
            <span className="dp-summary-chip dp-chip-tempsa"><Thermometer size={12} /> SA <strong>{summary.temperature_sa}</strong></span>
          )}
          {summary.unknown > 0 && (
            <span className="dp-summary-chip dp-chip-unknown"><HelpCircle size={12} /> Unknown <strong>{summary.unknown}</strong></span>
          )}
          <button className="dp-toggle-all-btn" onClick={handleToggleAll}>
            {expandAll ? '▲ 모두 접기' : '▼ 모두 펼치기'}
          </button>
        </div>

        {/* Relationship Guide */}
        <div className="dp-guide">
          <span>GroupIndex 당 구성:</span>
          <span className="dp-guide-item"><strong>Temperature</strong> 1개</span>
          <span className="dp-guide-sep">·</span>
          <span className="dp-guide-item"><strong>Power</strong> 1개</span>
          <span className="dp-guide-sep">·</span>
          <span className="dp-guide-item"><strong>Intensity</strong> N개</span>
        </div>

        {/* Group Accordions */}
        <div className="dp-groups">
          {sortedKeys.map((gKey) => {
            const g = groups[gKey];
            const isExpanded = expandedGroups.has(gKey);
            const total = g.intensity.length + g.power.length + g.temperature.length + g.temperature_sa.length + g.unknown.length;

            return (
              <div key={gKey} className={`dp-group ${isExpanded ? 'dp-group-open' : ''}`}>
                <div className="dp-group-header" onClick={() => toggleGroup(gKey)}>
                  <span className="dp-expand-icon">{isExpanded ? '▼' : '▶'}</span>
                  <strong className="dp-group-label">Group {gKey}</strong>
                  {(() => {
                    const allRows = [...g.temperature, ...g.temperature_sa, ...g.power, ...g.intensity, ...g.unknown];
                    const firstRow = allRows[0];
                    if (!firstRow) return null;
                    const freq = col(firstRow, 'TxFrequencyHz');
                    const wf = col(firstRow, 'TxpgWaveformStyle', 'txpgWaveformStyle');
                    const cycle = col(firstRow, 'numTxCycles', 'ProbeNumTxCycles', 'TxCycles');
                    return (
                      <span className="dp-group-meta">
                        Freq: <strong>{freq}</strong>
                        <span className="dp-meta-sep">|</span>
                        WF: <strong>{wf}</strong>
                        <span className="dp-meta-sep">|</span>
                        Cycle: <strong>{cycle}</strong>
                      </span>
                    );
                  })()}
                  <span className="dp-group-badges">
                    <span className={`dp-badge dp-badge-temp${g.temperature.length === 0 ? ' dp-badge-empty' : ''}`}><Thermometer size={11} /> {g.temperature.length}</span>
                    <span className={`dp-badge dp-badge-tempsa${g.temperature_sa.length === 0 ? ' dp-badge-empty' : ''}`}><Thermometer size={11} /> SA {g.temperature_sa.length}</span>
                    <span className={`dp-badge dp-badge-power${g.power.length === 0 ? ' dp-badge-empty' : ''}`}><Scale size={11} /> {g.power.length}</span>
                    <span className={`dp-badge dp-badge-intensity${g.intensity.length === 0 ? ' dp-badge-empty' : ''}`}><Droplet size={11} /> {g.intensity.length}</span>
                    {g.unknown.length > 0 && <span className="dp-badge dp-badge-unknown"><HelpCircle size={11} /> {g.unknown.length}</span>}
                  </span>
                  <span className="dp-group-total">{total} rows</span>
                </div>

                {isExpanded && (
                  <div className="dp-group-body">
                    {renderMiniTable(g.temperature, 'temperature')}
                    {renderMiniTable(g.temperature_sa, 'temperature_sa')}
                    {renderMiniTable(g.power, 'power')}
                    {renderMiniTable(g.intensity, 'intensity')}
                    {renderMiniTable(g.unknown, 'unknown')}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
