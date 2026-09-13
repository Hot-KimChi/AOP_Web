/**
 * 데이터 포맷팅 유틸리티
 * 
 * @description
 * 숫자, 텍스트 등 데이터를 화면에 표시하기 위한 포맷팅 함수들
 */

/**
 * 소수점 2자리로 고정 표기할 컬럼 패턴
 *
 * 측정/리포트 수치는 자릿수를 통일해야 비교가 쉬우므로 별도 규칙을 적용한다.
 */
export const FLOAT2_PATTERN = /^(XP_Value_\d+|reportValue_\d+|Difference_\d+|Ambient_Temp_\d+|MaxReportValue)$/;

/**
 * 숫자를 포맷팅합니다
 * 
 * @param {number|string} value - 포맷할 값
 * @param {string} [columnName] - 컬럼명 (자릿수 고정 규칙 판정용)
 * @returns {string|number} 포맷된 값
 * 
 * @example
 * formatNumber(3.14159) // 3.1416
 * formatNumber(5) // 5
 * formatNumber(1.5, 'reportValue_1') // "1.50"
 * formatNumber("text") // "text"
 */
export const formatNumber = (value, columnName) => {
  if (typeof value === 'number') {
    if (columnName && FLOAT2_PATTERN.test(columnName)) {
      return value.toFixed(2);
    }
    // 정수면 그대로, 소수면 소수점 4자리까지
    return value % 1 === 0 ? value : parseFloat(value.toFixed(4));
  }
  return value?.toString() || '';
};

/**
 * 텍스트를 지정된 길이로 자릅니다
 * 
 * @param {string} text - 자를 텍스트
 * @param {number} maxLength - 최대 길이 (기본값: 16)
 * @returns {string} 잘린 텍스트 (필요시 "..." 추가)
 * 
 * @example
 * truncateText("This is a very long text", 10) // "This is a ..."
 * truncateText("Short", 10) // "Short"
 */
export const truncateText = (text, maxLength = 16) => {
  if (!text) return '';
  const str = text.toString();
  return str.length > maxLength ? `${str.substring(0, maxLength)}...` : str;
};

/**
 * 깊은 복사를 수행합니다
 * 
 * @param {any} data - 복사할 데이터
 * @returns {any} 복사된 데이터
 */
export const deepCopy = (data) => {
  return JSON.parse(JSON.stringify(data));
};
