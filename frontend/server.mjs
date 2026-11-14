// AOP Web 운영 서버 (npm start).
//
// `vite build` 결과(dist/)를 서빙하고, 같은 출처의 /api/ 요청을 Flask 백엔드로 전달한다.
// 외부 의존성 없이 Node 기본 모듈만 쓴다(vite preview 는 운영용이 아니다).
//
// 환경변수
//   PORT             수신 포트(기본 3000)
//   HOST             수신 주소(기본 0.0.0.0 — 다른 PC 에서 접속)
//   AOP_BACKEND_URL  백엔드 주소(기본 http://localhost:5000)

import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'dist');
const INDEX_HTML = path.join(ROOT, 'index.html');
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const BACKEND = new URL(process.env.AOP_BACKEND_URL || 'http://localhost:5000');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};
const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.map', '.txt']);

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'same-origin',
};
const PROXY_SECURITY_HEADERS = Object.fromEntries(
  Object.entries(SECURITY_HEADERS).map(([k, v]) => [k.toLowerCase(), v]),
);

// 요청과 응답 사이에서 전달하면 안 되는 hop-by-hop 헤더
const HOP_BY_HOP = [
  'connection', 'keep-alive', 'proxy-connection', 'proxy-authenticate',
  'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade',
];

if (!fs.existsSync(INDEX_HTML)) {
  console.error(`[server] ${INDEX_HTML} 가 없습니다. 먼저 'npm run build' 를 실행하세요.`);
  process.exit(1);
}

// ---------------------------------------------------------------- 정적 파일

// 서빙 가능한 파일은 dist 안의 '일반 파일'뿐이다. 요청 경로로 디스크를 직접 찾지 않고
// 시작 시 만든 목록(URL 경로 → 파일)과 대소문자까지 정확히 일치할 때만 서빙한다.
// → 심볼릭 링크·정션(목록에서 제외)과 Windows 대소문자 별칭으로 dist 밖이나 캐시 증식에 닿지 않는다.
let manifest = new Map();
let manifestScannedAt = 0;
const MANIFEST_RESCAN_MS = 2000;

function scanDist() {
  const next = new Map();
  const walk = (dir, urlPrefix) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const url = `${urlPrefix}/${entry.name}`;
      if (entry.isDirectory()) walk(full, url);
      else if (entry.isFile()) next.set(url, full);
      // isSymbolicLink() 등 그 밖의 항목은 의도적으로 제외
    }
  };
  walk(ROOT, '');
  manifest = next;
  manifestScannedAt = Date.now();
  // 재빌드로 사라진 파일의 압축 캐시는 버린다.
  const live = new Set(next.values());
  for (const key of gzipCache.keys()) if (!live.has(key)) gzipCache.delete(key);
}
// 압축 결과는 파일당 1개(최신 mtime)만 둔다 → 캐시 크기는 dist 파일 수로 제한된다.
const gzipCache = new Map();
const REAL_ROOT = fs.realpathSync(ROOT);
scanDist();

function sendError(res, status, message) {
  res.writeHead(status, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(message);
}

function lookup(urlPath) {
  let filePath = manifest.get(urlPath);
  // 서버 실행 중 재빌드된 경우를 위해, 목록에 없으면 짧은 간격으로만 다시 스캔한다.
  if (!filePath && Date.now() - manifestScannedAt > MANIFEST_RESCAN_MS) {
    try {
      scanDist();
    } catch {
      return null;
    }
    filePath = manifest.get(urlPath);
  }
  if (!filePath) return null;
  try {
    const stat = fs.lstatSync(filePath);
    if (!stat.isFile()) return null;
    // 스캔 후 상위 폴더가 링크·정션으로 바뀐 경우까지 막기 위해 실제 경로로 dist 경계를 다시 확인한다.
    if (!fs.realpathSync(filePath).startsWith(REAL_ROOT + path.sep)) return null;
    return { filePath, stat };
  } catch {
    return null;
  }
}

function resolveStatic(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return { error: 400 };
  }
  if (decoded.includes('\0')) return { error: 400 };
  if (decoded.includes('\\') || decoded.split('/').some((seg) => seg === '..' || seg === '.')) {
    return { error: 403 };
  }

  const found = decoded !== '/' && lookup(decoded);
  if (found) return found;
  // 확장자가 있는 주소(자산)는 실제 404, 그 외는 SPA 라우트이므로 index.html
  if (path.extname(decoded)) return { error: 404 };
  const index = lookup('/index.html');
  return index || { error: 404 };
}

// Accept-Encoding 에서 gzip(또는 *)이 q>0 으로 허용됐는지 판단한다.
function acceptsGzip(header) {
  let star = false;
  for (const part of String(header || '').toLowerCase().split(',')) {
    const [name, ...params] = part.trim().split(';');
    const qParam = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
    const q = qParam ? Number(qParam.slice(2)) : 1;
    if (name === 'gzip') return q > 0;
    if (name === '*') star = q > 0;
  }
  return star;
}

function serveStatic(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    sendError(res, 405, 'Method Not Allowed');
    return;
  }

  const found = resolveStatic(pathname);
  if (found.error) {
    sendError(res, found.error, { 403: 'Forbidden', 404: 'Not Found' }[found.error] || 'Bad Request');
    return;
  }

  const { filePath, stat } = found;
  const ext = path.extname(filePath).toLowerCase();
  const isHashedAsset = filePath.startsWith(path.join(ROOT, 'assets') + path.sep);
  const etag = `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;

  const headers = {
    ...SECURITY_HEADERS,
    'Content-Type': MIME[ext] || 'application/octet-stream',
    // 해시가 붙은 자산은 내용이 바뀌면 이름도 바뀌므로 1년 캐시, 나머지(index.html)는 매번 재검증
    'Cache-Control': isHashedAsset ? 'public, max-age=31536000, immutable' : 'no-cache',
    ETag: etag,
    Vary: 'Accept-Encoding',
  };

  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, headers);
    res.end();
    return;
  }

  if (acceptsGzip(req.headers['accept-encoding']) && COMPRESSIBLE.has(ext) && stat.size > 1024) {
    let cached = gzipCache.get(filePath);
    if (!cached || cached.mtimeMs !== stat.mtimeMs) {
      cached = { mtimeMs: stat.mtimeMs, body: zlib.gzipSync(fs.readFileSync(filePath), { level: 9 }) };
      gzipCache.set(filePath, cached);
    }
    const body = cached.body;
    res.writeHead(200, { ...headers, 'Content-Encoding': 'gzip', 'Content-Length': body.length });
    res.end(req.method === 'HEAD' ? undefined : body);
    return;
  }

  res.writeHead(200, { ...headers, 'Content-Length': stat.size });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  fs.createReadStream(filePath).on('error', () => res.destroy()).pipe(res);
}

// ---------------------------------------------------------------- /api 프록시

const backendClient = BACKEND.protocol === 'https:' ? https : http;
const backendAgent = new backendClient.Agent({ keepAlive: true });

function stripHopByHop(headers) {
  const out = { ...headers };
  const listed = String(headers.connection || '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  for (const name of [...HOP_BY_HOP, ...listed]) delete out[name];
  return out;
}

function proxyApi(req, res) {
  const headers = stripHopByHop(req.headers);
  // 브라우저가 보낸 전달 메타데이터(Forwarded, X-Forwarded-*, X-Real-IP)는 위조될 수 있으므로
  // 모두 지우고 이 서버가 본 값만 새로 넣는다.
  for (const name of Object.keys(headers)) {
    if (name === 'forwarded' || name === 'x-real-ip' || name.startsWith('x-forwarded-')) delete headers[name];
  }
  headers['x-forwarded-for'] = req.socket.remoteAddress || '';
  headers['x-forwarded-proto'] = 'http';
  if (req.headers.host) headers['x-forwarded-host'] = req.headers.host;

  const upstream = backendClient.request(
    {
      protocol: BACKEND.protocol,
      hostname: BACKEND.hostname,
      port: BACKEND.port,
      method: req.method,
      path: req.url,
      headers,
      agent: backendAgent,
    },
    (upRes) => {
      // 백엔드가 보낸 같은 헤더가 있으면 그 값을 우선한다(키는 소문자로 통일해 중복 방지).
      res.writeHead(upRes.statusCode || 502, { ...PROXY_SECURITY_HEADERS, ...stripHopByHop(upRes.headers) });
      upRes.pipe(res);
      upRes.on('error', () => res.destroy());
    },
  );

  // 대용량 업로드·장시간 ML 요청이 있으므로 프록시 구간에서 시간 제한을 두지 않는다.
  upstream.setTimeout(0);
  upstream.on('error', (err) => {
    if (res.headersSent || clientGone) {
      // 브라우저가 먼저 끊어 백엔드 요청을 취소한 경우는 백엔드 장애가 아니므로 기록하지 않는다.
      res.destroy();
      return;
    }
    console.error(`[server] 백엔드 연결 실패(${BACKEND.origin}): ${err.code || err.message}`);
    // AuthContext 는 502~504 를 '서버에 연결할 수 없음'(offline)으로 처리한다.
    res.writeHead(502, { ...SECURITY_HEADERS, 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ status: 'error', message: 'Backend server is unavailable.' }));
  });

  // 브라우저가 요청을 끊으면 백엔드 요청도 끊는다.
  let clientGone = false;
  res.on('close', () => {
    if (!res.writableFinished) {
      clientGone = true;
      upstream.destroy();
    }
  });
  req.pipe(upstream);
}

// ---------------------------------------------------------------- 서버

const server = http.createServer((req, res) => {
  let pathname;
  try {
    pathname = new URL(req.url, 'http://localhost').pathname;
  } catch {
    sendError(res, 400, 'Bad Request');
    return;
  }

  if (pathname.startsWith('/api/')) {
    proxyApi(req, res);
    return;
  }
  serveStatic(req, res, pathname);
});

// 업로드 본문 수신이 길어질 수 있으므로 요청 전체 시간 제한은 끈다(헤더 수신 제한은 유지).
server.requestTimeout = 0;
server.headersTimeout = 60_000;

server.on('clientError', (err, socket) => {
  if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
  else socket.destroy();
});

server.listen(PORT, HOST, () => {
  console.log(`[server] AOP Web: http://localhost:${PORT} (dist 서빙, /api → ${BACKEND.origin})`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
