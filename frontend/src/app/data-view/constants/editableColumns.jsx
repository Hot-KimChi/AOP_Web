/**
 * 편집 가능한 컬럼 정의
 * 
 * @description
 * data-view 페이지에서 사용자가 직접 수정할 수 있는 컬럼들의 목록입니다.
 * 이 컬럼들은 셀 편집, 유효성 검사 등의 대상이 됩니다.
 */

export const EDITABLE_COLUMN_KEYS = [
  'measSetComments',      // 측정 설정 코멘트 (텍스트)
  'maxTxVoltageVolt',     // 최대 송신 전압 (숫자)
  'ceilTxVoltageVolt',    // 상한 송신 전압 (숫자)
  'numTxCycles'           // 송신 사이클 수 (숫자)
];

/**
 * 숫자 형식 검증이 필요한 컬럼들
 */
export const NUMERIC_COLUMNS = [
  'maxTxVoltageVolt',
  'ceilTxVoltageVolt',
  'numTxCycles'
];

/**
 * 텍스트 형식 컬럼들 (유효성 검사 불필요)
 */
export const TEXT_COLUMNS = [
  'measSetComments'
];
