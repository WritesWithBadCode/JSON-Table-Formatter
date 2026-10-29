'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseTextConfig, validateConfig } = require('../src/config');
const { getRows, render } = require('../src/format');
const data = {
  generated: 'today', results: [
    { target: { host: 'web', port: 443 }, success: true, names: ['alpha', 'beta'], error: null },
    { target: { host: 'mail', port: 0 }, success: false, names: [], error: { message: 'down' } }
  ]
};
const config = validateConfig(parseTextConfig(`
# comment
@rows = $.results[*]
@missing = (none)
Host = $.target.host
Port = $.target.port
Success = $.success
Names = $.names[*]
Error = $.error.message
Scan date = $$.generated
`));
test('text config: columns, global paths, missing, lists and false/zero values', () => {
  const rows = getRows(data, config);
  assert.deepEqual(rows, [
    { Host: 'web', Port: '443', Success: 'true', Names: 'alpha, beta', Error: '(none)', 'Scan date': 'today' },
    { Host: 'mail', Port: '0', Success: 'false', Names: '(none)', Error: 'down', 'Scan date': 'today' }
  ]);
});
test('table and markdown formatting', () => {
  const table = render(data, config);
  assert.match(table, /\| Host\s+\| Port\s+\|/);
  assert.match(table, /\| web\s+\| 443\s+\|/);
  assert.match(table, /\| mail\s+\| 0\s+\| false\s+\|/);
  const md = render(data, { ...config, format: 'markdown' });
  assert.match(md, /^\| Host \| Port \| Success \| Names \| Error \| Scan date \|/);
  assert.match(md, /\| --- \| --- \|/);
});
test('CSV quotes and delimiters, TSV, JSON', () => {
  const cfg = validateConfig({ rows: '$[*]', columns: [{ header: 'val', path: '$.val' }] });
  const input = [{ val: 'a,b' }, { val: 'Hello "world"' }, { val: 'x\ny' }];
  assert.equal(render(input, { ...cfg, format: 'csv' }), 'val\n"a,b"\n"Hello ""world"""\n"x\ny"\n');
  assert.equal(render(input, { ...cfg, format: 'tsv' }), 'val\na,b\n"Hello ""world"""\n"x\ny"\n');
  assert.deepEqual(JSON.parse(render(input, { ...cfg, format: 'json' })), [{ val: 'a,b' }, { val: 'Hello "world"' }, { val: 'x\ny' }]);
});
test('default rows: entire object or top-level array; no results = headers only', () => {
  const cfg = validateConfig({ columns: [{ header: 'Name', path: '$.name' }] });
  assert.deepEqual(getRows({ name: 'a' }, cfg), [{ Name: 'a' }]);
  assert.deepEqual(getRows([{ name: 'a' }, { name: 'b' }], cfg), [{ Name: 'a' }, { Name: 'b' }]);
  assert.equal(getRows({ empty: [] }, { ...cfg, rows: '$.empty[*]' }).length, 0);
  assert.match(render({ empty: [] }, { ...cfg, rows: '$.empty[*]' }), /\| Name \|/);
});
test('truncate, object values and escaping line breaks', () => {
  const cfg = validateConfig({ columns: [{ header: 'Value', path: '$.value' }] });
  assert.match(render({ value: { b: 2 } }, cfg), /\{"b":2\}/);
  assert.match(render({ value: 'hello\nworld' }, cfg), /hello\\nworld/);
  assert.match(render({ value: 'longvalue' }, { ...cfg, maxWidth: 5 }), /long…/);
});
test('invalid configs rejected, duplicate headers rejected', () => {
  assert.throws(() => validateConfig({ columns: [] }), /At least/);
  assert.throws(() => validateConfig({ columns: [{ header: 'X' }] }), /JSONPath/);
  assert.throws(() => validateConfig({ columns: [{ header: 'X', path: '$' }], maxWidth: -1 }), /nonnegative/);
  const cfg = validateConfig({ columns: [{ header: 'X', path: '$' }, { header: 'X', path: '$' }] });
  assert.throws(() => render({ x: 1 }, cfg), /unique/);
});
