/**
 * 행 식별자 유틸리티
 *
 * @description
 * 필터·정렬로 화면 순서가 바뀌어도 원본 행을 정확히 지목할 수 있도록
 * 각 행에 고유 식별자를 부여한다.
 *
 * Symbol 키를 사용하므로 Object.keys / JSON.stringify 에 노출되지 않는다.
 * 즉 테이블 헤더나 sessionStorage 저장 값을 오염시키지 않는다.
 */

export const ROW_ID = Symbol('aopRowId');

let rowIdCounter = 0;

/**
 * 행 배열에 식별자를 부여합니다(이미 있으면 유지).
 */
export const assignRowIds = (rows) => {
  if (!Array.isArray(rows)) return rows;
  rows.forEach((row) => {
    if (row && typeof row === 'object' && row[ROW_ID] === undefined) {
      row[ROW_ID] = `row-${rowIdCounter++}`;
    }
  });
  return rows;
};

/**
 * 행의 식별자를 반환합니다.
 */
export const getRowId = (row) =>
  row && typeof row === 'object' ? row[ROW_ID] : undefined;

/**
 * 식별자를 유지한 채 행 배열을 복사합니다.
 *
 * CSV 행은 평면 객체이므로 얕은 복사로 충분하며, 전개 연산자는
 * Symbol 키도 함께 복사한다.
 */
export const cloneRows = (rows) =>
  Array.isArray(rows) ? rows.map((row) => ({ ...row })) : [];

/**
 * 식별자로 행의 인덱스를 찾습니다. 없으면 -1.
 */
export const findRowIndexById = (rows, rowId) => {
  if (!Array.isArray(rows) || rowId === undefined) return -1;
  return rows.findIndex((row) => getRowId(row) === rowId);
};
