/**
 * 사용자 메시지 상수
 * 
 * @description
 * 알림, 확인 대화상자 등에 사용되는 모든 메시지를 중앙에서 관리합니다.
 * 다국어 지원이나 메시지 수정 시 이 파일만 변경하면 됩니다.
 */

export const MESSAGES = {
  // 성공 메시지
  SAVE_SUCCESS: '수정된 데이터가 저장되었습니다.',
  
  // 확인 메시지
  DELETE_CONFIRM: '정말로 이 행을 삭제하시겠습니까? 이 작업은 저장 전까지 취소할 수 있습니다.',
  REVERT_CONFIRM: '모든 변경 사항을 취소하고 원래 데이터로 복원하시겠습니까?',
  RESTORE_CONFIRM: '삭제된 모든 행을 복원하시겠습니까?',
  
  // 오류 메시지
  ERROR_VALIDATION: '유효성 검사 오류가 있습니다. 모든 오류를 수정한 후 다시 시도하세요.',
  ERROR_NO_DATA: '다운로드할 데이터가 없습니다.',
  ERROR_NO_DATA_FOUND: '데이터를 찾을 수 없습니다.',
  ERROR_DATA_LOAD: '데이터 로드 중 오류가 발생했습니다.',
  ERROR_DOWNLOAD: '다운로드 중 오류가 발생했습니다. 다시 시도해주세요.',
  
  // 정보 메시지
  INFO_NO_MATCHING_DATA: '필터 조건에 맞는 데이터가 없습니다. 필터를 조정해주세요.',
};
