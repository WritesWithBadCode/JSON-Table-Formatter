'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { query, parsePath } = require('../src/jsonpath');
const json = {
  results: [
    { host: 'a.test', port: 443, certs: [{ dnsNames: ['a.test', 'b.test'] }, { dnsNames: ['ca.test'] }] },
    { host: 'b.test', port: 587, certs: [{ dnsNames: ['b.test'] }] },
    { host: 'c.test', port: 25, certs: [] }
  ],
  'weird.name': { 'key with spaces': false },
  nested: { target: { id: 10 } },
  target: { id: 5 }
};
test('root, nested and array selectors', () => {
  assert.deepEqual(query(json, '$.results[*].host'), ['a.test', 'b.test', 'c.test']);
  assert.deepEqual(query(json, '$.results[1].port'), [587]);
  assert.deepEqual(query(json, '$.results[-1].host'), ['c.test']);
  assert.deepEqual(query(json, '$.results[0].certs[0].dnsNames[*]'), ['a.test', 'b.test']);
  assert.deepEqual(query(json, '$'), [json]);
  assert.deepEqual(query(json, 'results[0].host'), ['a.test']);
});
test('quoted properties with dots and spaces', () => {
  assert.deepEqual(query(json, '$["weird.name"]["key with spaces"]'), [false]);
  assert.deepEqual(query(json, "$['weird.name']['key with spaces']"), [false]);
  assert.deepEqual(query({ "escape'quote": 1 }, "$['escape\\'quote']"), [1]);
});
test('unions and slices', () => {
  assert.deepEqual(query(json, '$.results[0,2].host'), ['a.test', 'c.test']);
  assert.deepEqual(query(json, '$.results[1:3].port'), [587, 25]);
  assert.deepEqual(query(json, '$.results[::-1].host'), ['c.test', 'b.test', 'a.test']);
  assert.deepEqual(query(json, '$.results[::2].port'), [443, 25]);
  assert.deepEqual(query({ a: 1, b: 2 }, "$['a','b']"), [1, 2]);
});
test('recursive descent and wildcard', () => {
  assert.deepEqual(query(json, '$..target.id'), [5, 10]);
  assert.deepEqual(query(json, '$..dnsNames[*]'), ['a.test', 'b.test', 'ca.test', 'b.test']);
  assert.deepEqual(query(json, '$.results[*].certs[*].dnsNames[*]'), ['a.test', 'b.test', 'ca.test', 'b.test']);
});
test('missing data, falsy values, malicious or unsupported syntax', () => {
  assert.deepEqual(query(json, '$.missing.name'), []);
  assert.deepEqual(query(json, '$["weird.name"]["key with spaces"]'), [false]);
  for (const path of ['$.results[?(@.host)]', '$.a[', '$.results[0:3:0]', '$.foo.', '$.results[foo()]']) {
    assert.throws(() => parsePath(path), /JSONPath|selector|bracket|dot/);
  }
});
