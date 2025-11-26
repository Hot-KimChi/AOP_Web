/**
 * CSV 파일 내보내기 유틸리티
 * 
 * @description
 * 데이터를 CSV 형식으로 변환하고 다운로드하는 기능
 */

/**
 * CSV 내용을 생성합니다
 * 
 * @param {Array<Object>} data - CSV로 변환할 데이터 배열
 * @returns {string} CSV 형식의 문자열
 */
export const generateCSVContent = (data) => {
  if (!data || data.length === 0) return '';
  
  // 헤더 가져오기
  const headers = Object.keys(data[0] || {});
  
  // CSV 내용 생성
  const csvContent = [
    headers.join(','),
    ...data.map(row =>
      headers.map(header => {
        const value = row[header];
        // 쉼표가 포함된 문자열은 따옴표로 감싸기
        return typeof value === 'string' && value.includes(',') ? `"${value}"` : value;
      }).join(',')
    )
  ].join('\n');
  
  return csvContent;
};

/**
 * CSV 파일을 다운로드합니다
 * 
 * @param {Array<Object>} data - 다운로드할 데이터
 * @param {string} filename - 파일명 (확장자 제외)
 * @throws {Error} 다운로드 실패 시
 * 
 * @example
 * downloadCSV(dataArray, "측정_데이터")
 */
export const downloadCSV = (data, filename = '측정_데이터') => {
  if (!data || data.length === 0) {
    throw new Error('다운로드할 데이터가 없습니다.');
  }

  try {
    const csvContent = generateCSVContent(data);
    
    // BOM 추가하여 한글 깨짐 방지
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    // 파일명에 날짜 추가
    const dateStr = new Date().toLocaleDateString().replace(/\//g, '-');
    const fullFilename = `${filename}_${dateStr}.csv`;

    link.setAttribute('href', url);
    link.setAttribute('download', fullFilename);
    link.style.display = 'none';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('CSV 내보내기 실패:', error);
    throw new Error('다운로드 중 오류가 발생했습니다.');
  }
};
