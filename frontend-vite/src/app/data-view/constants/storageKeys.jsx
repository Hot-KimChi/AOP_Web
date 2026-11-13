/**
 * SessionStorage 키 상수
 * 
 * @description
 * sessionStorage에 저장되는 모든 키를 중앙에서 관리합니다.
 * 오타 방지 및 키 변경 시 한 곳에서만 수정하면 됩니다.
 */

export const STORAGE_KEYS = {
  // 데이터 관련
  CSV_DATA: 'csvData',
  REPORT_DATA: 'reportData',
  SUMMARY_DATA: 'summaryData',
  FULL_CSV_DATA: 'fullCsvData',
  
  // 설정 관련
  EDITABLE_COLUMNS: 'editableColumns',
  DATA_VIEW_SOURCE: 'dataViewSource',
  
  // 상태 관련
  DATA_WINDOW_OPEN: 'dataWindowOpen',
  DATA_MODIFIED: 'dataModified',
  PARENT_WINDOW_ID: 'parentWindowId',
};

/**
 * 데이터 소스 타입
 */
export const DATA_SOURCES = {
  MEASSET_GENERATION: 'measset-generation',
  REPORT: 'report',
  SUMMARY: 'summary',
};

/**
 * 윈도우 상태
 */
export const WINDOW_STATUS = {
  OPEN: 'open',
  CLOSED: 'closed',
};
