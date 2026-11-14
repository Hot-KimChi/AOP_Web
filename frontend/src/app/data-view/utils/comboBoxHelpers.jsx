/**
 * 콤보박스 옵션 생성 유틸리티
 * 
 * @description
 * 필터용 콤보박스의 옵션 목록을 생성하는 함수들
 */

/**
 * 데이터에서 각 컬럼의 고유값을 추출하여 콤보박스 옵션 생성
 * 
 * @param {Array<Object>} data - 데이터 배열
 * @returns {Object} 컬럼별 고유값 배열을 담은 객체
 * 
 * @example
 * const data = [{ name: 'A', age: 10 }, { name: 'B', age: 10 }];
 * generateComboBoxOptions(data) 
 * // { name: ['A', 'B'], age: [10] }
 */
export const generateComboBoxOptions = (data) => {
  if (!data || data.length === 0) return {};
  
  const options = {};
  const columns = Object.keys(data[0] || {});
  
  columns.forEach((column) => {
    // Set을 사용하여 중복 제거
    options[column] = [...new Set(data.map(row => row[column]))];
  });

  return options;
};
