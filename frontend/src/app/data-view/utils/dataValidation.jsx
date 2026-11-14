/**
 * 데이터 유효성 검사 유틸리티
 * 
 * @description
 * 셀 데이터의 유효성을 검증하는 함수들
 */

import { NUMERIC_COLUMNS, TEXT_COLUMNS } from '../constants/editableColumns';

/**
 * 숫자 필드 유효성 검사
 * 
 * @param {string|number} value - 검사할 값
 * @returns {boolean} 유효하면 true
 */
export const validateNumericField = (value) => {
  if (value === "" || value === null || value === undefined) return true;
  return !isNaN(parseFloat(value));
};

/**
 * 셀 데이터 유효성 검사
 * 
 * @param {string} columnName - 컬럼명
 * @param {any} value - 검사할 값
 * @param {Array<string>} editableKeys - 편집 가능한 컬럼 목록
 * @returns {string|null} 오류 메시지 (유효하면 null)
 * 
 * @example
 * validateCellData('maxTxVoltageVolt', 'abc', editableKeys) // "유효한 숫자를 입력하세요"
 * validateCellData('maxTxVoltageVolt', '123', editableKeys) // null
 */
export const validateCellData = (columnName, value, editableKeys) => {
  // 편집 가능한 열인지 확인
  const isEditable = editableKeys && editableKeys.includes(columnName);
  
  if (!isEditable) {
    return null; // 편집 불가능한 열은 검증하지 않음
  }
  
  // 텍스트 컬럼은 검증 불필요
  if (TEXT_COLUMNS.includes(columnName)) {
    return null;
  }
  
  // 숫자 컬럼 검증
  if (NUMERIC_COLUMNS.includes(columnName)) {
    if (!validateNumericField(value)) {
      return '유효한 숫자를 입력하세요';
    }
  }
  
  return null;
};
