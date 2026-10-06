/**
 * Windows SSO 게이트 — SSPI 결과를 검사한 뒤에만 Flask 에 로그인 주장을 전달한다.
 *
 * Kerberos 만 허용한다. Negotiate 는 NTLM 으로 폴백할 수 있는데, NTLM 은 상호 인증이
 * 없어 HTTP(평문)에서는 중간자가 다른 사용자의 NTLM 핸드셰이크를 이 서버로 릴레이할 수 있다.
 * 따라서 `req.sso.method` 가 정확히 'Kerberos' 가 아니면(NTLM·undefined·알 수 없는 값)
 * Flask 를 호출하지 않고 거부한다(fail-closed).
 */

const os = require('os');
const { isIP } = require('net');

const ALLOWED_SSO_METHOD = 'Kerberos';
const BACKEND_TIMEOUT_MS = 10000;

function normalizeNegotiateAuthorization(value) {
  if (typeof value !== 'string') return null;
  const match = /^Negotiate\s+(\S+)$/i.exec(value);
  return match ? `Negotiate ${match[1]}` : null;
}

function isIpAddressHost(value) {
  if (typeof value !== 'string') return false;
  const host = value.startsWith('[') && value.endsWith(']')
    ? value.slice(1, -1)
    : value;
  return isIP(host) !== 0;
}

function sendError(res, status, message) {
  res.status(status).json({ status: 'error', message });
}

function isLocalMachineAccount(domain, machineName = process.env.COMPUTERNAME || os.hostname()) {
  const machine = String(machineName || '').trim();
  return Boolean(machine) && domain.toUpperCase() === machine.toUpperCase();
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * BACKEND_INTERNAL_URL 검증. 공유 비밀이 평문으로 네트워크에 나가지 않도록
 * HTTP 는 루프백 호스트에만 허용하고, 그 외 호스트는 HTTPS 만 허용한다.
 * @returns {{ url: string|null, error: string|null }}
 */
function validateBackendUrl(raw) {
  let parsed;
  try {
    parsed = new URL(String(raw || '').trim());
  } catch {
    return { url: null, error: 'BACKEND_INTERNAL_URL is not a valid URL.' };
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    return { url: null, error: 'BACKEND_INTERNAL_URL must not contain credentials, query or fragment.' };
  }
  const host = parsed.hostname.toLowerCase();
  if (parsed.protocol === 'http:') {
    if (!LOOPBACK_HOSTS.has(host)) {
      return { url: null, error: 'BACKEND_INTERNAL_URL must use HTTPS unless the host is localhost, 127.0.0.1 or ::1.' };
    }
  } else if (parsed.protocol !== 'https:') {
    return { url: null, error: 'BACKEND_INTERNAL_URL must use http (loopback only) or https.' };
  }
  return { url: `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, ''), error: null };
}

/**
 * @param {{ backendUrl: string, sharedSecret: string, fetchImpl?: typeof fetch, machineName?: string }} options
 */
function createSsoForwarder({ backendUrl: rawBackendUrl, sharedSecret, fetchImpl = fetch, machineName }) {
  const { url: backendUrl, error: urlError } = validateBackendUrl(rawBackendUrl);
  if (urlError) throw new Error(urlError);
  return async function forwardToBackend(req, res) {
    const sso = req.sso;
    const method = sso && sso.method;
    if (method !== ALLOWED_SSO_METHOD) {
      console.warn(`[SSO] Rejected non-Kerberos authentication (method=${method === undefined ? 'undefined' : String(method)})`);
      return sendError(res, 401, 'Windows sign-in requires Kerberos. Open the site by its intranet host name, not an IP address.');
    }

    const user = sso.user;
    const domain = String((user && user.domain) || '').trim();
    const name = String((user && user.name) || '').trim();
    if (!domain || !name) {
      return sendError(res, 401, 'Windows authentication failed.');
    }
    if (isLocalMachineAccount(domain, machineName)) {
      console.warn(`[SSO] Rejected local machine account '${domain}\\${name}'`);
      return sendError(res, 403, 'Only Windows domain accounts are allowed.');
    }

    let backendRes;
    try {
      backendRes = await fetchImpl(`${backendUrl}/api/auth/sso`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-AOP-SSO-Secret': sharedSecret,
        },
        body: JSON.stringify({ domain, name }),
        // 리디렉션을 따라가면 공유 비밀 헤더가 다른 서버로 전달될 수 있으므로 거부한다.
        redirect: 'error',
        signal: AbortSignal.timeout(BACKEND_TIMEOUT_MS),
      });
    } catch (err) {
      console.error(`[SSO] Backend request failed (${backendUrl}): ${err.message}`);
      return sendError(res, 502, 'Cannot reach the authentication server. Please contact the administrator.');
    }
    // fetchImpl 이 redirect 정책을 무시하는 경우에도 3xx 를 그대로 전달하지 않는다.
    if (backendRes.status >= 300 && backendRes.status < 400) {
      console.error(`[SSO] Backend returned unexpected redirect (HTTP ${backendRes.status})`);
      return sendError(res, 502, 'Authentication server returned an unexpected response.');
    }

    const body = await backendRes.json().catch(() => null);
    for (const cookie of backendRes.headers.getSetCookie()) {
      res.append('Set-Cookie', cookie);
    }
    if (!body) {
      return sendError(res, backendRes.ok ? 502 : backendRes.status, `Authentication server error (HTTP ${backendRes.status})`);
    }
    return res.status(backendRes.status).json(body);
  };
}

module.exports = {
  ALLOWED_SSO_METHOD,
  createSsoForwarder,
  isIpAddressHost,
  isLocalMachineAccount,
  normalizeNegotiateAuthorization,
  validateBackendUrl,
};
