//src/app/data-view/page.js
'use client';

import { useEffect, useState, Suspense, useCallback } from 'react';
import { MESSAGES } from './constants/messages';
import { downloadCSV as downloadCSVFile } from './utils/csvExport';

// Custom Hooks
import { useDataManagement } from './hooks/useDataManagement';
import { useDataFilter } from './hooks/useDataFilter';
import { useDataSort } from './hooks/useDataSort';
import { useDataEdit } from './hooks/useDataEdit';
import { useRowOperations } from './hooks/useRowOperations';
import { useWindowSync } from './hooks/useWindowSync';

// Components
import { LoadingSpinner } from './components/LoadingSpinner';
import { ErrorMessage } from './components/ErrorMessage';
import { ChangeSummary } from './components/ChangeSummary';
import { ActionButtons } from './components/ActionButtons';
import { DataTable } from './components/DataTable';

/**
 * 데이터 뷰 메인 컴포넌트
 * 
 * @description
 * CSV 데이터를 테이블 형태로 표시하고 편집, 필터링, 정렬 등의 기능을 제공합니다.
 * Custom Hooks를 사용하여 각 기능을 모듈화하였습니다.
 */
function DataViewContent() {
  // 1. 데이터 관리
  const {
    csvData,
    originalData,
    displayData,
    isLoading,
    error,
    comboBoxOptions,
    editableColumns,
    dataViewSource,
    setCsvData,
    setDisplayData,
    setOriginalData,
    setComboBoxOptions,
    loadDataFromStorage,
    refreshData,
    saveData,
    syncDataBeforeUnload,
  } = useDataManagement();

  // 2. 필터링
  const {
    filters,
    handleComboBoxChange,
    clearFilter,
  } = useDataFilter(csvData, setDisplayData, () => { });

  // 3. 정렬
  const {
    sortConfig,
    handleSort,
  } = useDataSort(displayData, setDisplayData);

  // 4. 편집
  const {
    editedData,
    validationErrors,
    showChanges,
    setShowChanges,
    handleCellChange,
    saveEditedData,
    revertChanges,
  } = useDataEdit(
    csvData,
    setCsvData,
    originalData,
    setOriginalData,
    displayData,
    setDisplayData,
    editableColumns,
    filters,
    saveData
  );

  // 5. 행 조작
  const {
    deletedRows,
    setDeletedRows,
    handleDeleteRow,
    handleCopyRow,
    restoreDeletedRows,
  } = useRowOperations(
    csvData,
    setCsvData,
    displayData,
    setDisplayData,
    filters,
    editedData,
    () => { },
    validationErrors,
    () => { }
  );

  // 6. 윈도우 동기화
  useWindowSync(refreshData, syncDataBeforeUnload, editedData, deletedRows);

  // 초기 데이터 로드
  useEffect(() => {
    loadDataFromStorage();
  }, [loadDataFromStorage]);

  // CSV 다운로드 핸들러
  const handleDownloadCSV = useCallback(() => {
    try {
      downloadCSVFile(displayData, '측정_데이터');
    } catch (error) {
      console.error('내보내기 실패:', error);
      alert(MESSAGES.ERROR_DOWNLOAD);
    }
  }, [displayData]);

  // ML for temperature 핸들러
  const handleMLForTemperature = useCallback(async () => {
    if (!displayData || displayData.length === 0) {
      alert(MESSAGES.INFO_NO_DATA_TO_PROCESS);
      return;
    }

    try {
      console.log('ML for temperature 처리 시작');
      console.log('처리할 데이터:', displayData);

      // TODO: ML 처리 API 호출 구현
      // const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000';
      // const response = await fetch(`${API_BASE_URL}/api/ml-temperature`, {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ data: displayData })
      // });
      // if (!response.ok) throw new Error('ML 처리 실패');
      // const result = await response.json();

      alert(MESSAGES.ML_COMPLETE);
    } catch (error) {
      console.error('ML 처리 오류:', error);
      alert(MESSAGES.ERROR_ML_PROCESSING);
    }
  }, [displayData]);

  // 변경 사항 저장 핸들러
  const handleSave = useCallback(() => {
    saveEditedData(deletedRows);
    setDeletedRows([]);
  }, [saveEditedData, deletedRows, setDeletedRows]);

  // 렌더링
  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (error) {
    return <ErrorMessage message={error} />;
  }

  const hasChanges = Object.keys(editedData).length > 0 || deletedRows.length > 0;
  const hasErrors = Object.keys(validationErrors).length > 0;
  const hasData = displayData && displayData.length > 0;

  return (
    <div className="min-vh-100 p-4 bg-light">
      <div className="container-fluid">
        <div className="bg-white rounded-4 shadow-lg border">
          {/* Header */}
          <div className="px-4 py-3 bg-white border-bottom">
            <h4 className="text-dark fw-semibold mb-0">
              📊 CSV 데이터 표시 <span className="text-muted fs-6 ms-2">(measSetComments, maxTxVoltageVolt, ceilTxVoltageVolt, numTxCycles 수정 가능)</span>
            </h4>
          </div>

          {/* Action Bar */}
          <div className="px-4 py-3 bg-light border-bottom">
            <ActionButtons
              showChanges={showChanges}
              onToggleChanges={() => setShowChanges(!showChanges)}
              dataViewSource={dataViewSource}
              isLoading={isLoading}
              hasData={hasData}
              onMLForTemperature={handleMLForTemperature}
              hasChanges={hasChanges}
              hasErrors={hasErrors}
              onSave={handleSave}
              onRevert={revertChanges}
              onDownload={handleDownloadCSV}
              onClose={() => window.close()}
            />
          </div>

          {/* Summary */}
          <div className="px-4">
            <ChangeSummary
              changedCount={Object.keys(editedData).length}
              deletedCount={deletedRows.length}
              errorCount={Object.keys(validationErrors).length}
              onRestoreDeleted={restoreDeletedRows}
            />
          </div>

          {/* Data Table */}
          <div className="px-4 pb-4">
            <DataTable
              displayData={displayData}
              editableKeys={editableColumns.editableKeys}
              sortConfig={sortConfig}
              filters={filters}
              comboBoxOptions={comboBoxOptions}
              editedData={editedData}
              validationErrors={validationErrors}
              showChanges={showChanges}
              onSort={handleSort}
              onFilterChange={handleComboBoxChange}
              onClearFilter={clearFilter}
              onCellChange={handleCellChange}
              onCopyRow={handleCopyRow}
              onDeleteRow={handleDeleteRow}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DataView() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <DataViewContent />
    </Suspense>
  );
}
