'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { normalizeNegotiateAuthorization } = require('../ssoGate');

test('SSPI receives only non-empty Negotiate authorization tokens', () => {
  assert.equal(normalizeNegotiateAuthorization(undefined), null);
  assert.equal(normalizeNegotiateAuthorization('Negotiate'), null);
  assert.equal(normalizeNegotiateAuthorization('Negotiate   '), null);
  assert.equal(normalizeNegotiateAuthorization('NTLM token'), null);
  assert.equal(normalizeNegotiateAuthorization('Negotiate token'), 'Negotiate token');
  assert.equal(normalizeNegotiateAuthorization('negotiate token'), 'Negotiate token');
});
