'use client';

import { useEffect, useState } from 'react';
import Layout from '../../components/Layout';

export default function VerificationReport() {
  const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000';

  const normalizeProbeId = (value) => {
    const raw = String(value ?? '').trim();
    if (!raw) {
      return '';
    }
    const numeric = Number(raw);
    if (!Number.isNaN(numeric)) {
      return String(Math.trunc(numeric));
    }
    return raw;
  };

  const [DBList, setDBList] = useState([]);

  const [reportDatabase, setReportDatabase] = useState('');
  const [reportProbeList, setReportProbeList] = useState([]);
  const [reportSoftwareList, setReportSoftwareList] = useState([]);
  const [reportProbeSoftwareMapping, setReportProbeSoftwareMapping] = useState({});
  const [reportFilteredSoftwareList, setReportFilteredSoftwareList] = useState([]);
  const [reportProbe, setReportProbe] = useState('');
  const [reportSoftwareVersion, setReportSoftwareVersion] = useState('');
  const [reportWcsVersionList, setReportWcsVersionList] = useState([]);
  const [reportFilteredWcsVersions, setReportFilteredWcsVersions] = useState([]);
  const [reportWcsSoftware, setReportWcsSoftware] = useState('');
  const [temperature, setTemperature] = useState('');
  const [MI, setMI] = useState('');
  const [Ispta, setIspta] = useState('');
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState('');

  const [txDatabase, setTxDatabase] = useState('');
  const [txProbeList, setTxProbeList] = useState([]);
  const [txProbe, setTxProbe] = useState('');
  const [txSoftwareVersionList, setTxSoftwareVersionList] = useState([]);
  const [txSoftwareVersion, setTxSoftwareVersion] = useState('');
  const [txFile, setTxFile] = useState(null);
  const [txLoading, setTxLoading] = useState(false);
  const [txError, setTxError] = useState('');
  const [txValidationMessage, setTxValidationMessage] = useState('');
  const [txValidationOk, setTxValidationOk] = useState(false);

  const [summaryData, setSummaryData] = useState(null);
  const [reportData, setReportData] = useState(null);

  useEffect(() => {
    const fetchDatabases = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/get_list_database`, {
          method: 'GET',
          credentials: 'include',
        });
        if (!response.ok) {
          throw new Error('데이터베이스 목록을 가져오는데 실패했습니다.');
        }
        const data = await response.json();
        setDBList(data.databases || []);
      } catch (err) {
        setReportError(err.message || '데이터베이스 목록 조회 실패');
      }
    };
    fetchDatabases();
  }, [API_BASE_URL]);

  const loadReportSoftwareData = async (database) => {
    const url = new URL(`${API_BASE_URL}/api/get_table_data`);
    url.searchParams.append('database', database);
    url.searchParams.append('table', 'Tx_summary');
    const response = await fetch(url.toString(), { method: 'GET', credentials: 'include' });
    if (!response.ok) {
      const txt = await response.text();
      throw new Error(`Software 데이터 조회 실패: ${txt}`);
    }
    const data = await response.json();
    setReportProbeList(data.probes || []);
    setReportSoftwareList(data.software || []);
    setReportProbeSoftwareMapping(data.mapping || {});
  };

  const loadReportWcsData = async (database) => {
    const url = new URL(`${API_BASE_URL}/api/get_table_data`);
    url.searchParams.append('database', database);
    url.searchParams.append('table', 'WCS');
    const response = await fetch(url.toString(), { method: 'GET', credentials: 'include' });
    if (!response.ok) {
      const txt = await response.text();
      throw new Error(`WCS 데이터 조회 실패: ${txt}`);
    }
    const data = await response.json();
    const wcsData = Array.isArray(data.wcsVersions)
      ? data.wcsVersions.map((wcs) => ({
          ...wcs,
          probeId: String(wcs.probeId),
          myVersion: String(wcs.myVersion),
        }))
      : [];
    setReportWcsVersionList(wcsData);
  };

  useEffect(() => {
    if (!reportDatabase) {
      setReportProbeList([]);
      setReportSoftwareList([]);
      setReportProbeSoftwareMapping({});
      setReportWcsVersionList([]);
      setReportFilteredWcsVersions([]);
      setReportFilteredSoftwareList([]);
      setReportProbe('');
      setReportSoftwareVersion('');
      setReportWcsSoftware('');
      return;
    }
    const fetchData = async () => {
      setReportLoading(true);
      setReportError('');
      try {
        await Promise.all([
          loadReportSoftwareData(reportDatabase),
          loadReportWcsData(reportDatabase),
        ]);
      } catch (err) {
        setReportError(err.message || 'Verification 데이터 조회 실패');
      } finally {
        setReportLoading(false);
      }
    };
    fetchData();
  }, [reportDatabase]);

  useEffect(() => {
    if (!reportProbe) {
      setReportFilteredSoftwareList([]);
      setReportFilteredWcsVersions([]);
      setReportSoftwareVersion('');
      setReportWcsSoftware('');
      return;
    }
    const softwareForProbe = reportProbeSoftwareMapping[reportProbe] || [];
    const swVersionSet = new Set(softwareForProbe.map((item) => item.softwareVersion));
    setReportFilteredSoftwareList(
      reportSoftwareList.filter((sw) => swVersionSet.has(sw.softwareVersion))
    );
    setReportFilteredWcsVersions(
      reportWcsVersionList.filter((wcs) => wcs.probeId === String(reportProbe))
    );
    setReportSoftwareVersion('');
    setReportWcsSoftware('');
  }, [reportProbe, reportProbeSoftwareMapping, reportSoftwareList, reportWcsVersionList]);

  const loadTxProbes = async (database) => {
    const url = new URL(`${API_BASE_URL}/api/get_table_data`);
    url.searchParams.append('database', database);
    url.searchParams.append('table', 'Tx_summary');
    const response = await fetch(url.toString(), { method: 'GET', credentials: 'include' });
    if (!response.ok) {
      const txt = await response.text();
      throw new Error(`Tx Probe 조회 실패: ${txt}`);
    }
    const data = await response.json();
    setTxProbeList(data.probes || []);
  };

  const loadTxSoftwareVersions = async (database, probeId) => {
    const normalizedProbeId = normalizeProbeId(probeId);
    const url = new URL(`${API_BASE_URL}/api/get_imaging_sw_versions`);
    url.searchParams.append('database', database);
    url.searchParams.append('probeId', normalizedProbeId);
    const response = await fetch(url.toString(), { method: 'GET', credentials: 'include' });
    if (response.status === 404) {
      const fallbackUrl = new URL(`${API_BASE_URL}/api/get_table_data`);
      fallbackUrl.searchParams.append('database', database);
      fallbackUrl.searchParams.append('table', 'meas_station_setup');
      const fallbackResponse = await fetch(fallbackUrl.toString(), { method: 'GET', credentials: 'include' });
      if (!fallbackResponse.ok) {
        const fallbackText = await fallbackResponse.text();
        throw new Error(`Software version 조회 실패: ${fallbackText}`);
      }
      const fallbackData = await fallbackResponse.json();
      const rows = Array.isArray(fallbackData.data) ? fallbackData.data : [];
      const selectedProbe = normalizedProbeId;
      const seen = new Set();
      const versions = [];
      for (const row of rows) {
        if (normalizeProbeId(row.probeId) !== selectedProbe) {
          continue;
        }
        const version = String(row.imagingSwVersion ?? '').trim();
        if (!version || seen.has(version)) {
          continue;
        }
        seen.add(version);
        versions.push({
          softwareVersion: version,
          _id: `fallback_sw_${versions.length}`,
        });
      }
      setTxSoftwareVersionList(versions);
      return;
    }
    if (!response.ok) {
      const txt = await response.text();
      throw new Error(`Software version 조회 실패: ${txt}`);
    }
    const data = await response.json();
    setTxSoftwareVersionList(data.softwareVersions || []);
  };

  useEffect(() => {
    if (!txDatabase) {
      setTxProbeList([]);
      setTxProbe('');
      setTxSoftwareVersionList([]);
      setTxSoftwareVersion('');
      return;
    }
    const fetchTxProbes = async () => {
      setTxLoading(true);
      setTxError('');
      try {
        await loadTxProbes(txDatabase);
      } catch (err) {
        setTxError(err.message || 'Tx Probe 조회 실패');
      } finally {
        setTxLoading(false);
      }
    };
    fetchTxProbes();
  }, [txDatabase]);

  useEffect(() => {
    if (!txDatabase || !txProbe) {
      setTxSoftwareVersionList([]);
      setTxSoftwareVersion('');
      return;
    }
    const fetchVersions = async () => {
      setTxLoading(true);
      setTxError('');
      try {
        await loadTxSoftwareVersions(txDatabase, txProbe);
      } catch (err) {
        setTxError(err.message || 'Software version 조회 실패');
      } finally {
        setTxLoading(false);
      }
    };
    fetchVersions();
  }, [txDatabase, txProbe]);

  const openTxValidationWindow = (validation) => {
    const comparisonRows = Array.isArray(validation.comparisonRows) && validation.comparisonRows.length > 0
      ? validation.comparisonRows
      : null;

    const storageKey = `txValidation_v2_${Date.now()}`;

    if (comparisonRows) {
      // 피벗 구조 생성: 행=No(행번호), 열=Parameter
      const rowNos = [...new Set(comparisonRows.map(r => r.No))].sort((a, b) => a - b);

      // SQL 컬럼 순서 보존: 첫 번째 No 행에서 Parameter 순서 추출
      const firstNo = rowNos[0];
      const paramNames = comparisonRows
        .filter(r => r.No === firstNo)
        .map(r => r.Parameter);

      // 헤더: Mode를 첫 컬럼으로 포함
      const params = ['Mode', ...paramNames];

      const pivotRows = rowNos.map(no => {
        const rowCells = comparisonRows.filter(r => r.No === no);
        const modeVal = rowCells.length > 0 ? String(rowCells[0].Mode ?? '') : '';
        const row = { _rowNo: no, _modeStr: modeVal };
        paramNames.forEach(param => {
          const found = rowCells.find(r => r.Parameter === param);
          // FileValue: "UNMATCHED"(매핑불가) | "NULL"(값없음) | 실제값
          row[param] = found ? (found.FileValue ?? 'UNMATCHED') : 'UNMATCHED';
        });
        return row;
      });

      sessionStorage.setItem(`${storageKey}_pivot`, JSON.stringify({ rowNos, params, rows: pivotRows }));
      sessionStorage.setItem(`${storageKey}_meta`, JSON.stringify({
        selectedProbeId: validation.selectedProbeId ?? '',
        selectedSoftwareVersion: validation.selectedSoftwareVersion ?? '',
        message: validation.message || '',
      }));
    } else {
      // 비교 데이터 없을 때 요약만 표시
      const summaryRows = [
        { Category: 'Selection', Item: 'Selected ProbeID', Value: validation.selectedProbeId ?? '' },
        { Category: 'Selection', Item: 'Selected SW Version', Value: validation.selectedSoftwareVersion ?? '' },
        { Category: 'Result', Item: 'DB Match', Value: validation.dbHasMatchingRows ? 'YES' : 'NO' },
        { Category: 'Result', Item: 'Message', Value: validation.message || '' },
      ];
      sessionStorage.setItem(storageKey, JSON.stringify(summaryRows));
      sessionStorage.setItem(`${storageKey}_columns`, JSON.stringify(Object.keys(summaryRows[0])));
    }

    window.open(
      `/verification-report/tx-matching-popup?storageKey=${encodeURIComponent(storageKey)}`,
      '_blank',
      'width=1500,height=900,menubar=no,toolbar=no,location=no,status=no'
    );
  };

  const validateTxFile = async (file, database, probeId, softwareVersion) => {
    if (!file || !database || !probeId || !softwareVersion) {
      return;
    }
    setTxValidationMessage('');
    setTxValidationOk(false);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('database', database);
    formData.append('probeId', probeId);
    formData.append('softwareVersion', softwareVersion);
    const response = await fetch(`${API_BASE_URL}/api/validate_tx_summary_file`, {
      method: 'POST',
      credentials: 'include',
      body: formData,
    });
    const rawText = await response.text();
    let data = null;
    try {
      data = rawText ? JSON.parse(rawText) : {};
    } catch {
      throw new Error(rawText || '파일 파라미터 검증 실패');
    }
    if (!response.ok || data.status !== 'success') {
      throw new Error(data.message || '파일 파라미터 검증 실패');
    }
    const validation = data.validation || {};
    const ok = Boolean(validation.matchesSelection && validation.dbHasMatchingRows);
    setTxValidationOk(ok);
    setTxValidationMessage(validation.message || '');
    openTxValidationWindow(validation);
    return ok;
  };

  const handleTxFileChange = (event) => {
    const selectedFile = event.target.files?.[0] || null;
    setTxFile(selectedFile);
    setTxValidationMessage('');
    setTxValidationOk(false);
    setTxError('');
    if (selectedFile && (!txDatabase || !txProbe || !txSoftwareVersion)) {
      setTxValidationMessage('파일이 선택되었습니다. Database/Probe/Software version 선택 후 자동 검증됩니다.');
    }
    // 실제 검증/매칭 팝업은 아래 useEffect가 단독으로 담당한다(팝업 중복 방지).
  };

  useEffect(() => {
    if (!txFile || !txDatabase || !txProbe || !txSoftwareVersion) {
      return;
    }
    const runValidation = async () => {
      try {
        setTxLoading(true);
        await validateTxFile(txFile, txDatabase, txProbe, txSoftwareVersion);
      } catch (err) {
        setTxError(err.message || '파일 검증 실패');
      } finally {
        setTxLoading(false);
      }
    };
    runValidation();
  }, [txFile, txDatabase, txProbe, txSoftwareVersion]);

  const uploadTxSummary = async () => {
    if (!txDatabase || !txProbe || !txSoftwareVersion || !txFile) {
      alert('Database, Probe, Software version, Input file을 모두 선택하세요.');
      return;
    }
    if (!txValidationOk) {
      alert('파일 파라미터 검증이 완료되지 않았습니다. 검증 결과를 확인하세요.');
      return;
    }
    setTxLoading(true);
    setTxError('');
    try {
      const formData = new FormData();
      formData.append('file', txFile);
      formData.append('database', txDatabase);
      formData.append('probeId', txProbe);
      formData.append('softwareVersion', txSoftwareVersion);
      const response = await fetch(`${API_BASE_URL}/api/upload_tx_summary`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      const data = await response.json();
      if (!response.ok || data.status !== 'success') {
        throw new Error(data.message || 'TX Summary 업로드 실패');
      }
      alert(data.message || 'TX Summary 업로드가 완료되었습니다.');
      await Promise.all([
        loadTxProbes(txDatabase),
        loadTxSoftwareVersions(txDatabase, txProbe),
      ]);
    } catch (err) {
      setTxError(err.message || 'TX Summary 업로드 실패');
    } finally {
      setTxLoading(false);
    }
  };

  const extractReportData = async () => {
    if (!reportDatabase || !reportProbe || !reportSoftwareVersion || !reportWcsSoftware) {
      alert('Database, Probe, TX Software, WCS S/W를 선택하세요.');
      return;
    }
    const tasks = [];
    if (temperature) {
      tasks.push({
        label: `Temp:${temperature}`,
        requestData: {
          database: reportDatabase,
          probeId: String(reportProbe),
          wcsSoftware: reportWcsSoftware,
          TxSumSoftware: reportSoftwareVersion,
          measSSId_Temp: temperature,
          measSSId_MI: null,
          measSSId_Ispta: null,
        },
      });
    }
    if (MI) {
      tasks.push({
        label: `MI:${MI}`,
        requestData: {
          database: reportDatabase,
          probeId: String(reportProbe),
          wcsSoftware: reportWcsSoftware,
          TxSumSoftware: reportSoftwareVersion,
          measSSId_Temp: null,
          measSSId_MI: MI,
          measSSId_Ispta: null,
        },
      });
    }
    if (Ispta) {
      tasks.push({
        label: `Ispta:${Ispta}`,
        requestData: {
          database: reportDatabase,
          probeId: String(reportProbe),
          wcsSoftware: reportWcsSoftware,
          TxSumSoftware: reportSoftwareVersion,
          measSSId_Temp: null,
          measSSId_MI: null,
          measSSId_Ispta: Ispta,
        },
      });
    }
    if (tasks.length === 0) {
      alert('SSid 값을 최소 1개 입력하세요.');
      return;
    }
    setReportLoading(true);
    setReportError('');
    try {
      for (const task of tasks) {
        const response = await fetch(`${API_BASE_URL}/api/run_tx_compare`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(task.requestData),
          credentials: 'include',
        });
        const data = await response.json();
        if (data.status === 'success' && Array.isArray(data.reportData)) {
          setReportData(data.reportData);
          sessionStorage.setItem(`reportData_${task.label}`, JSON.stringify(data.reportData));
          if (data.columns) {
            sessionStorage.setItem(
              `reportData_${task.label}_columns`,
              JSON.stringify(data.columns)
            );
          }
          window.open(
            `/verification-report/data-view-standalone?pageLabel=${encodeURIComponent(task.label)}&storageKey=${encodeURIComponent(`reportData_${task.label}`)}`,
            '_blank',
            'width=2000,height=800,menubar=no,toolbar=no,location=no,status=no'
          );
        } else {
          alert(`${task.label} 데이터 없음`);
        }
      }
    } catch (err) {
      setReportError(err.message || '리포트 추출 실패');
    } finally {
      setReportLoading(false);
    }
  };

  return (
    <Layout>
      <div className="page-wrapper">
        <div className="card mb-3">
          <div className="card-header">
            <div className="card-title-row">
              <span style={{ fontSize: '1rem' }}>📑</span>
              <h5>Tx Summary Input</h5>
            </div>
          </div>
          <div className="card-body" style={{ padding: '1.25rem' }}>
            <div className="row g-3">
              <div className="col-md-3">
                <label htmlFor="txDBSelect" className="form-label">Database</label>
                <select
                  id="txDBSelect"
                  className="form-select"
                  value={txDatabase}
                  onChange={(e) => {
                    setTxDatabase(e.target.value);
                    setTxProbe('');
                    setTxSoftwareVersion('');
                    setTxFile(null);
                    setTxValidationMessage('');
                    setTxValidationOk(false);
                  }}
                  disabled={txLoading}
                >
                  <option value="">Select database…</option>
                  {DBList.map((db, i) => <option key={i} value={db}>{db}</option>)}
                </select>
              </div>
              <div className="col-md-3">
                <label htmlFor="txProbeSelect" className="form-label">Probe</label>
                <select
                  id="txProbeSelect"
                  className="form-select"
                  value={txProbe}
                  onChange={(e) => {
                    setTxProbe(e.target.value);
                    setTxSoftwareVersion('');
                    setTxValidationMessage('');
                    setTxValidationOk(false);
                  }}
                  disabled={txLoading || !txDatabase}
                >
                  <option value="">Select probe…</option>
                  {txProbeList.map((probe) => (
                    <option key={probe._id} value={probe.probeId}>
                      {probe.probeName} ({Number(probe.probeId).toString()})
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-md-3">
                <label htmlFor="txSoftwareVersionSelect" className="form-label">Software version</label>
                <select
                  id="txSoftwareVersionSelect"
                  className="form-select"
                  value={txSoftwareVersion}
                  onChange={(e) => {
                    setTxSoftwareVersion(e.target.value);
                    setTxValidationMessage('');
                    setTxValidationOk(false);
                  }}
                  disabled={txLoading || !txProbe}
                >
                  <option value="">Select software version…</option>
                  {txSoftwareVersionList.map((sw) => (
                    <option key={sw._id} value={sw.softwareVersion}>{sw.softwareVersion}</option>
                  ))}
                </select>
              </div>
              <div className="col-md-3">
                <label htmlFor="txFileInput" className="form-label">Input File</label>
                <input
                  type="file"
                  id="txFileInput"
                  className="form-control"
                  accept=".csv,.txt"
                  onChange={handleTxFileChange}
                  disabled={txLoading}
                />
              </div>
              <div className="col-md-12">
                <button
                  className="btn w-100"
                  style={{ background: '#6366f1', color: 'white', border: 'none', borderRadius: '6px', fontWeight: '500', fontSize: '0.875rem' }}
                  onClick={uploadTxSummary}
                  disabled={!txDatabase || !txProbe || !txSoftwareVersion || !txFile || txLoading || !txValidationOk}
                >
                  {txLoading ? 'Processing…' : '📥 Upload TX Summary to DB'}
                </button>
              </div>
              {txValidationMessage && (
                <div className={`col-md-12 alert ${txValidationOk ? 'alert-success' : 'alert-warning'}`} style={{ marginBottom: 0 }}>
                  {txValidationMessage}
                </div>
              )}
              {txError && <div className="col-md-12 alert alert-danger" style={{ marginBottom: 0 }}>{txError}</div>}
            </div>
          </div>
        </div>

        <div className="card mb-3">
          <div className="card-header">
            <div className="card-title-row">
              <span style={{ fontSize: '1rem' }}>📋</span>
              <h5>Verification Report</h5>
            </div>
          </div>
          <div className="card-body" style={{ padding: '1.25rem' }}>
            <div className="row g-3">
              <div className="col-md-2">
                <label htmlFor="reportDatabaseSelect" className="form-label">Database</label>
                <select
                  id="reportDatabaseSelect"
                  className="form-select"
                  value={reportDatabase}
                  onChange={(e) => {
                    setReportDatabase(e.target.value);
                    setReportProbe('');
                    setReportSoftwareVersion('');
                    setReportWcsSoftware('');
                  }}
                  disabled={reportLoading}
                >
                  <option value="">Select database…</option>
                  {DBList.map((db, i) => <option key={i} value={db}>{db}</option>)}
                </select>
              </div>
              <div className="col-md-2">
                <label htmlFor="reportProbeSelect" className="form-label">Probe</label>
                <select
                  id="reportProbeSelect"
                  className="form-select"
                  value={reportProbe}
                  onChange={(e) => setReportProbe(e.target.value)}
                  disabled={reportLoading || !reportDatabase}
                >
                  <option value="">Select probe…</option>
                  {reportProbeList.map((probe) => (
                    <option key={probe._id} value={probe.probeId}>
                      {probe.probeName} ({Number(probe.probeId).toString()})
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-md-2">
                <label htmlFor="reportWcsSelect" className="form-label">WCS S/W</label>
                <select
                  id="reportWcsSelect"
                  className="form-select"
                  value={reportWcsSoftware}
                  onChange={(e) => setReportWcsSoftware(e.target.value)}
                  disabled={reportLoading || !reportProbe}
                >
                  <option value="">Select WCS S/W…</option>
                  {reportFilteredWcsVersions.map((w, i) => <option key={i} value={w.myVersion}>{w.myVersion}</option>)}
                </select>
              </div>
              <div className="col-md-2">
                <label htmlFor="reportSoftwareSelect" className="form-label">TX Software</label>
                <select
                  id="reportSoftwareSelect"
                  className="form-select"
                  value={reportSoftwareVersion}
                  onChange={(e) => setReportSoftwareVersion(e.target.value)}
                  disabled={reportLoading || !reportProbe}
                >
                  <option value="">Select software…</option>
                  {reportFilteredSoftwareList.map((sw) => (
                    <option key={sw._id} value={sw.softwareVersion}>{sw.softwareVersion}</option>
                  ))}
                </select>
              </div>
              <div className="col-md-2">
                <label htmlFor="temperatureInput" className="form-label">Temperature measSSid</label>
                <input
                  type="text"
                  id="temperatureInput"
                  className="form-control"
                  value={temperature}
                  onChange={(e) => setTemperature(e.target.value)}
                  disabled={reportLoading}
                  placeholder="e.g. 1001"
                />
              </div>
              <div className="col-md-2">
                <label htmlFor="miInput" className="form-label">MI measSSid</label>
                <input
                  type="text"
                  id="miInput"
                  className="form-control"
                  value={MI}
                  onChange={(e) => setMI(e.target.value)}
                  disabled={reportLoading}
                  placeholder="e.g. 1002"
                />
              </div>
              <div className="col-md-12">
                <label htmlFor="isptaInput" className="form-label">Ispta.3 measSSid</label>
                <input
                  type="text"
                  id="isptaInput"
                  className="form-control"
                  value={Ispta}
                  onChange={(e) => setIspta(e.target.value)}
                  disabled={reportLoading}
                  placeholder="e.g. 1003"
                />
              </div>
              <div className="col-md-12">
                <button
                  className="btn w-100"
                  style={{ background: '#10b981', color: 'white', border: 'none', borderRadius: '6px', fontWeight: '500', fontSize: '0.875rem' }}
                  onClick={extractReportData}
                  disabled={!reportDatabase || !reportProbe || !reportWcsSoftware || !reportSoftwareVersion || reportLoading}
                >
                  {reportLoading ? 'Processing…' : '📊 Extract Report Table'}
                </button>
              </div>
              {reportError && <div className="col-md-12 alert alert-danger" style={{ marginBottom: 0 }}>{reportError}</div>}
            </div>
          </div>
        </div>

        {summaryData && (
          <div className="card mb-3">
            <div className="card-header">
              <div className="card-title-row">
                <h5>Summary Table Preview</h5>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>showing first 5 rows</span>
              </div>
            </div>
            <div className="card-body" style={{ padding: '1rem 1.25rem' }}>
              <div className="table-responsive">
                <table className="table table-sm" style={{ fontSize: '0.8rem' }}>
                  <thead style={{ background: 'var(--bg)' }}>
                    {summaryData.length > 0 && (
                      <tr>{Object.keys(summaryData[0]).map((k, i) => <th key={i}>{k}</th>)}</tr>
                    )}
                  </thead>
                  <tbody>
                    {summaryData.slice(0, 5).map((row, ri) => (
                      <tr key={ri}>
                        {Object.values(row).map((v, ci) => <td key={ci}>{v}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {reportData && (
          <div className="card">
            <div className="card-header">
              <div className="card-title-row">
                <h5>Report Data Preview</h5>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>showing first 5 rows</span>
              </div>
            </div>
            <div className="card-body" style={{ padding: '1rem 1.25rem' }}>
              <div className="table-responsive">
                <table className="table table-sm" style={{ fontSize: '0.8rem' }}>
                  <thead style={{ background: 'var(--bg)' }}>
                    {reportData.length > 0 && (
                      <tr>{Object.keys(reportData[0]).map((k, i) => <th key={i}>{k}</th>)}</tr>
                    )}
                  </thead>
                  <tbody>
                    {reportData.slice(0, 5).map((row, ri) => (
                      <tr key={ri}>
                        {Object.values(row).map((v, ci) => <td key={ci}>{v}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
