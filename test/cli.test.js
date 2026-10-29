'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const entry = path.join(__dirname, '..', 'index.js');
const genericData = path.join(__dirname, '..', 'examples', 'generic.json');
const genericConfig = path.join(__dirname, '..', 'examples', 'generic-columns.txt');
function run(args, input) {
  return spawnSync(process.execPath, [entry, ...args], { encoding: 'utf8', input });
}
test('CLI parses sample data into a useful table with correct headers', () => {
  const r = run([genericData, genericConfig]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /\| Name\s+\| Department\s+\|/);
  assert.match(r.stdout, /\| Alex\s+\| Technology\s+\|/);
});
test('CLI can read stdin and write CSV output', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'json-table-test-'));
  try {
    const dest = path.join(dir, 'report.csv');
    const data = fs.readFileSync(genericData, 'utf8');
    const r = run(['-i', '-', '-c', genericConfig, '-f', 'csv', '-o', dest], data);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, '');
    assert.match(fs.readFileSync(dest, 'utf8'), /Name,Department,City,Skills,Company/);
    assert.match(fs.readFileSync(dest, 'utf8'), /Alex,Technology,Minneapolis/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('invalid path rejects the run with a nonzero exit status', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'json-table-test-'));
  try {
    const map = path.join(dir, 'map.txt');
    fs.writeFileSync(map, 'Invalid = $.a[?(@.b)]\n');
    const r = run(['-i', genericData, '-c', map]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /filter expressions are not supported/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
