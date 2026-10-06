// Windows SSO 게이트 회귀 테스트: `npm run test:sso` (node:test, Next/SSPI 불필요)
const http = require('node:http');
const test = require('node:test');
const assert = require('node:assert/strict');
const { createSsoForwarder, validateBackendUrl } = require('../ssoGate');

function mockRes() {
  return {
    statusCode: 200,
    body: undefined,
    cookies: [],
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    append(name, value) { if (name === 'Set-Cookie') this.cookies.push(value); return this; },
  };
}

function setup() {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ status: 'success' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Set-Cookie': 'auth_token=t; HttpOnly; SameSite=Lax' },
    });
  };
  const forward = createSsoForwarder({
    backendUrl: 'https://backend.test',
    sharedSecret: 'x'.repeat(40),
    fetchImpl,
    machineName: 'WEBSRV01',
  });
  return { calls, forward };
}

const user = { domain: 'CORP', name: 'alice' };

for (const [label, sso] of [
  ['NTLM', { method: 'NTLM', user }],
  ['undefined method', { user }],
  ['unknown method', { method: 'Negotiate', user }],
  ['lower-case kerberos', { method: 'kerberos', user }],
  ['missing req.sso', undefined],
]) {
  test(`${label} is rejected before calling Flask`, async () => {
    const { calls, forward } = setup();
    const res = mockRes();
    await forward({ sso }, res);
    assert.equal(res.statusCode, 401);
    assert.equal(calls.length, 0);
    assert.deepEqual(res.cookies, []);
  });
}

test('Kerberos domain account is forwarded with server secret and cookie is relayed', async () => {
  const { calls, forward } = setup();
  const res = mockRes();
  await forward({ sso: { method: 'Kerberos', user } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://backend.test/api/auth/sso');
  assert.equal(calls[0].init.headers['X-AOP-SSO-Secret'], 'x'.repeat(40));
  assert.deepEqual(JSON.parse(calls[0].init.body), { domain: 'CORP', name: 'alice' });
  assert.deepEqual(res.cookies, ['auth_token=t; HttpOnly; SameSite=Lax']);
});

test('Kerberos local machine account is rejected before calling Flask', async () => {
  const { calls, forward } = setup();
  const res = mockRes();
  await forward({ sso: { method: 'Kerberos', user: { domain: 'websrv01', name: 'admin' } } }, res);
  assert.equal(res.statusCode, 403);
  assert.equal(calls.length, 0);
});

test('BACKEND_INTERNAL_URL allows HTTP only for loopback hosts', () => {
  for (const [raw, expected] of [
    ['http://127.0.0.1:5000', 'http://127.0.0.1:5000'],
    ['http://localhost:5000/', 'http://localhost:5000'],
    ['http://LOCALHOST:5000', 'http://localhost:5000'],
    ['http://[::1]:5000', 'http://[::1]:5000'],
    ['https://aop-api.corp.local', 'https://aop-api.corp.local'],
    ['https://10.0.0.5:5443/base/', 'https://10.0.0.5:5443/base'],
  ]) {
    assert.deepEqual(validateBackendUrl(raw), { url: expected, error: null }, raw);
  }
});

test('BACKEND_INTERNAL_URL rejects remote HTTP, bad protocols and malformed values', () => {
  for (const raw of [
    'http://10.0.0.5:5000',
    'http://aop-api.corp.local:5000',
    'http://127.0.0.2:5000',
    'http://localhost.evil.com:5000',
    'http://0.0.0.0:5000',
    'ftp://127.0.0.1/',
    'file:///C:/x',
    'javascript:alert(1)',
    '127.0.0.1:5000',
    'not a url',
    '',
    'https://user:pw@aop-api.corp.local',
    'https://aop-api.corp.local/?x=1',
  ]) {
    const result = validateBackendUrl(raw);
    assert.equal(result.url, null, raw);
    assert.ok(result.error, raw);
  }
});

test('createSsoForwarder refuses an insecure backend URL', () => {
  assert.throws(() => createSsoForwarder({
    backendUrl: 'http://10.0.0.5:5000',
    sharedSecret: 'x'.repeat(40),
    fetchImpl: async () => { throw new Error('must not be called'); },
  }), /HTTPS/);
});

function listen(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

test('real 307 redirect does not deliver the shared secret to the redirect target', async () => {
  const targetHits = [];
  const target = await listen((req, res) => {
    targetHits.push(req.headers['x-aop-sso-secret']);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Set-Cookie', 'auth_token=evil; HttpOnly');
    res.end('{"status":"success"}');
  });
  const targetUrl = `http://127.0.0.1:${target.address().port}/api/auth/sso`;
  let backendHits = 0;
  const backend = await listen((req, res) => {
    backendHits += 1;
    res.writeHead(307, { Location: targetUrl, 'Set-Cookie': 'auth_token=redirect; HttpOnly' });
    res.end();
  });
  try {
    const forward = createSsoForwarder({
      backendUrl: `http://127.0.0.1:${backend.address().port}`,
      sharedSecret: 'x'.repeat(40),
      machineName: 'WEBSRV01',
    });
    const res = mockRes();
    await forward({ sso: { method: 'Kerberos', user } }, res);
    assert.equal(backendHits, 1);
    assert.equal(res.statusCode, 502);
    assert.deepEqual(res.cookies, []);
    assert.deepEqual(targetHits, []);
  } finally {
    backend.close();
    target.close();
  }
});

test('3xx from a redirect-ignoring fetch is not relayed', async () => {
  const forward = createSsoForwarder({
    backendUrl: 'https://backend.test',
    sharedSecret: 'x'.repeat(40),
    machineName: 'WEBSRV01',
    fetchImpl: async (url, init) => {
      assert.equal(init.redirect, 'error');
      return new Response(null, {
        status: 307,
        headers: { Location: 'https://evil.test/', 'Set-Cookie': 'auth_token=redirect' },
      });
    },
  });
  const res = mockRes();
  await forward({ sso: { method: 'Kerberos', user } }, res);
  assert.equal(res.statusCode, 502);
  assert.deepEqual(res.cookies, []);
});
