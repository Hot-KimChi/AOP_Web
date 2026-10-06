/**
 * Express + Next.js Custom Server — Windows SSO(SSPI) 진입점.
 *
 * 왜 Custom Server 인가 — Next.js 기본 middleware 는 Edge 런타임에서 실행되어
 * 네이티브 모듈인 node-expose-sspi 를 쓸 수 없다. 그래서 Node 프로세스(Express)에서
 * `GET /auth/sso` 한 경로만 SSPI(Negotiate)로 인증하고, 나머지 요청은
 * 그대로 Next.js 에 넘긴다. NTLM 릴레이를 막기 위해 Kerberos 로 확인된 경우만
 * Flask 에 전달한다(ssoGate.js).
 *
 * 신뢰 경계
 *   - 사용자 신원은 SSPI 결과(req.sso.user)만 사용한다. 브라우저가 보낸 값은 쓰지 않는다.
 *   - Flask 로의 로그인 주장은 서버 간 공유 비밀(AUTH_SSO_SHARED_SECRET)로 보호한다.
 *   - JWT 발급과 AUTH_ALLOWED_USERS 판정은 Flask 가 한다. 여기서는 Flask 응답의
 *     Set-Cookie(auth_token) 를 브라우저로 그대로 전달한다. 쿠키는 포트를 구분하지 않으므로
 *     브라우저가 같은 호스트명의 :5000 API 를 호출할 때 함께 전송된다.
 *   - SSPI 를 쓸 수 없거나 설정이 없으면 인증을 우회하지 않고 명시적으로 실패한다.
 */

const http = require('http');
const path = require('path');

const production = process.argv.includes('--production');
process.env.NODE_ENV = production ? 'production' : 'development';

const { loadEnvConfig } = require('@next/env');
loadEnvConfig(__dirname, !production);

const express = require('express');
const next = require('next');
const { createSsoForwarder, normalizeNegotiateAuthorization, validateBackendUrl } = require('./ssoGate');

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOSTNAME || '0.0.0.0';
const BACKEND_INTERNAL_URL = process.env.BACKEND_INTERNAL_URL || 'http://127.0.0.1:5000';
const SSO_SHARED_SECRET = process.env.AUTH_SSO_SHARED_SECRET || '';
const MIN_SECRET_LENGTH = 32;

function sendError(res, status, message) {
  res.status(status).json({ status: 'error', message });
}

function loadSspi() {
  if (process.platform !== 'win32') {
    return { sso: null, error: 'Windows SSO requires the server to run on Windows.' };
  }
  try {
    return { sso: require('node-expose-sspi').sso, error: null };
  } catch (err) {
    return { sso: null, error: `node-expose-sspi could not be loaded: ${err.message}` };
  }
}

async function main() {
  const httpServer = http.createServer();
  const app = next({ dev: !production, dir: path.resolve(__dirname), hostname: HOST, port: PORT, httpServer });
  const handle = app.getRequestHandler();
  await app.prepare();

  const server = express();
  server.disable('x-powered-by');

  const { sso, error: sspiError } = loadSspi();
  const secretError = SSO_SHARED_SECRET.length >= MIN_SECRET_LENGTH
    ? null
    : `AUTH_SSO_SHARED_SECRET must be set (at least ${MIN_SECRET_LENGTH} characters).`;
  const configError = sspiError || secretError || validateBackendUrl(BACKEND_INTERNAL_URL).error;
  if (configError) {
    console.error(`[SSO] Windows SSO disabled: ${configError}`);
  }

  // 설정 오류가 있으면 SSPI 협상 전에 실패시킨다(우회 경로 없음).
  server.get('/auth/sso', (req, res, nextFn) => {
    res.set('Cache-Control', 'no-store');
    if (configError) return sendError(res, 503, 'Windows SSO is not configured on the server. Please contact the administrator.');
    return nextFn();
  });
  if (sso && !configError) {
    const forwardToBackend = createSsoForwarder({
      backendUrl: BACKEND_INTERNAL_URL,
      sharedSecret: SSO_SHARED_SECRET,
    });
    server.get(
      '/auth/sso',
      (req, res, nextFn) => {
        const authorization = req.headers.authorization;
        if (authorization) {
          const normalizedAuthorization = normalizeNegotiateAuthorization(authorization);
          if (!normalizedAuthorization) {
            console.warn('[SSO] Browser sent a Negotiate scheme without a usable token.');
            return sendError(res, 401, 'Windows sign-in did not complete. Use a domain browser trusted for this server hostname.');
          }
          req.headers.authorization = normalizedAuthorization;
        }
        return nextFn();
      },
      sso.auth({
        useActiveDirectory: false,
        useGroups: false,
        allowsGuest: false,
        allowsAnonymousLogon: false,
      }),
      (req, res, nextFn) => forwardToBackend(req, res).catch(nextFn),
    );
  }
  server.use('/auth/sso', (err, req, res, _nextFn) => {
    console.error(`[SSO] Authentication error: ${err && err.message}`);
    if (!res.headersSent) sendError(res, 401, 'Windows authentication failed.');
  });

  server.all('*', (req, res) => handle(req, res));

  httpServer.on('request', server);
  httpServer.listen(PORT, HOST, () => {
    console.log(`> AOP Web frontend ready on http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT} (${production ? 'production' : 'development'})`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
