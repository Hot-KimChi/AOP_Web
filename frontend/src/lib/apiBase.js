/**
 * 백엔드 API 주소를 결정한다.
 *
 * 왜 필요한가 — `http://localhost:5000` 을 고정으로 쓰면 서버 PC 본인의 브라우저에서만
 * 동작한다. `localhost` 는 서버가 아니라 **접속한 사용자의 PC** 를 가리키므로, 다른
 * PC 에서 `http://<서버IP>:3000` 으로 열면 자기 PC 의 5000 포트로 요청이 가 로그인 자체가
 * 실패한다. IP 를 하드코딩하는 방식도 서버 주소가 바뀌면 같은 방식으로 다시 깨진다.
 *
 * 그래서 **브라우저가 실제로 접속한 호스트**를 기준으로 산출한다.
 *   - localhost 로 열면 → http://localhost:5000
 *   - 서버 IP 로 열면   → http://<그 IP>:5000
 *
 * 백엔드가 프론트와 다른 호스트/포트에 있는 배포에서는 `NEXT_PUBLIC_API_BASE_URL` 로
 * 명시 지정하면 그 값이 항상 우선한다.
 */

const DEFAULT_BACKEND_PORT = '5000';

export function getApiBaseUrl() {
  const explicit = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (explicit) return explicit.replace(/\/+$/, '');

  // SSR/빌드 시점에는 window 가 없다. 이 모듈은 브라우저에서 다시 평가되므로
  // 실제 요청에는 아래 클라이언트 값이 쓰인다.
  if (typeof window === 'undefined') return `http://localhost:${DEFAULT_BACKEND_PORT}`;

  return `${window.location.protocol}//${window.location.hostname}:${DEFAULT_BACKEND_PORT}`;
}

export const API_BASE_URL = getApiBaseUrl();
