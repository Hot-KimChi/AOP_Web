'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { isIpAddressHost, normalizeNegotiateAuthorization } = require('../ssoGate');

test('IP address hosts are not eligible for a Kerberos challenge', () => {
  assert.equal(isIpAddressHost('10.82.218.49'), true);
  assert.equal(isIpAddressHost('127.0.0.1'), true);
  assert.equal(isIpAddressHost('[::1]'), true);
  assert.equal(isIpAddressHost('KRSUABN027SRV.ad005.onehc.net'), false);
  assert.equal(isIpAddressHost('localhost'), false);
  assert.equal(isIpAddressHost(undefined), false);
});

test('SSPI receives only non-empty Negotiate authorization tokens', () => {
  assert.equal(normalizeNegotiateAuthorization(undefined), null);
  assert.equal(normalizeNegotiateAuthorization('Negotiate'), null);
  assert.equal(normalizeNegotiateAuthorization('Negotiate   '), null);
  assert.equal(normalizeNegotiateAuthorization('NTLM token'), null);
  assert.equal(normalizeNegotiateAuthorization('Negotiate token'), 'Negotiate token');
  assert.equal(normalizeNegotiateAuthorization('negotiate token'), 'Negotiate token');
});
