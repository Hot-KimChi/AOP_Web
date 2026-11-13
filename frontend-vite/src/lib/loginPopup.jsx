'use client';

export const APP_VERSION = '0.9.82';

/** 로그인 페이지를 현재 창 중앙의 팝업으로 연다. 성공 시 팝업이 부모 창을 새로고침한다. */
export function openLoginPopup() {
  const w = 480;
  const h = 420;
  const left = Math.round(window.screenX + (window.outerWidth - w) / 2);
  const top = Math.round(window.screenY + (window.outerHeight - h) / 2);
  window.open(
    '/auth/login',
    'login',
    `width=${w},height=${h},left=${left},top=${top},resizable=no,scrollbars=no,menubar=no,toolbar=no,location=no,status=no`
  );
}
