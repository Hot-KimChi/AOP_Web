/**
 * 백엔드 API 주소를 결정한다.
 *
 * 브라우저는 자신이 연 주소(같은 출처)로 요청하고, 프런트 서버(개발: Vite, 운영: server.mjs)의
 * `/api` 프록시가 백엔드(기본 http://localhost:5000)로 전달한다. 그래서
 *   - CORS(ALLOWED_ORIGINS) 설정 없이 동작하고,
 *   - 원격 PC 에서 http://<서버IP>:3000 로 열어도 백엔드 주소를 알 필요가 없다.
 *
 * 백엔드를 프록시 없이 직접 호출해야 하는 배포에서는 `VITE_API_BASE_URL` 로
 * 명시 지정하면 그 값이 항상 우선한다.
 */

export function getApiBaseUrl() {
  const explicit = import.meta.env.VITE_API_BASE_URL;
  if (explicit) return explicit.replace(/\/+$/, '');

  // new URL(`${API_BASE_URL}/api/...`) 사용처가 있으므로 상대경로('')가 아닌 절대 origin 을 돌려준다.
  return window.location.origin;
}

export const API_BASE_URL = getApiBaseUrl();
