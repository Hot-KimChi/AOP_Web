import { API_BASE_URL } from './apiBase';

/** `{status, data, message}` 형식 API 호출. 실패 시 서버 메시지를 담은 Error 를 던진다. */
export async function apiJson(path, { method = 'GET', body, signal } = {}) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    credentials: 'include',
    signal,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let payload = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }
  if (!res.ok || payload?.status === 'error') {
    const err = new Error(payload?.message || `요청 실패 (HTTP ${res.status})`);
    err.status = res.status;
    err.data = payload?.data;
    throw err;
  }
  return payload?.data;
}

export function query(params) {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
  });
  return q.toString();
}
