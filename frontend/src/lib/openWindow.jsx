// 큰 하위 폼을 화면 전체 크기의 별도 브라우저 창으로 연다. 같은 name 이면 기존 창을 재사용한다.
import { showAlert } from './dialog';

export function openFullWindow(url, name) {
  const w = window.screen?.availWidth || 1600;
  const h = window.screen?.availHeight || 1000;
  const win = window.open(
    url,
    name,
    `width=${w},height=${h},left=0,top=0,menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes`,
  );
  if (win) win.focus();
  else showAlert('팝업이 차단되었습니다. 브라우저에서 이 사이트의 팝업을 허용해 주세요.');
  return win;
}

// 스크립트로 연 창에서 호출하면 화면 전체 크기로 다시 맞춘다(브라우저가 창 위치·크기를 바꿔 연 경우 대비).
export function fitWindowToScreen() {
  try {
    if (!window.opener) return;
    window.moveTo(0, 0);
    window.resizeTo(window.screen.availWidth, window.screen.availHeight);
  } catch {
    // 브라우저가 허용하지 않으면 무시한다.
  }
}
