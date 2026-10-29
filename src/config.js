'use strict';
const fs = require('node:fs');

// Plain .txt format: @rows = $.results[*] and Header = $.field.path
function parseTextConfig(text) {
  const config = { columns: [] };
  for (const [i, line] of text.replace(/^\uFEFF/, '').split(/\r?\n/).entries()) {
    const value = line.trim();
    if (!value || value.startsWith('#') || value.startsWith('//')) continue;
    const equals = line.indexOf('=');
    const tab = line.indexOf('\t');
    const sep = equals < 0 ? tab : tab < 0 ? equals : Math.min(equals, tab);
    if (sep < 0) throw new Error(`Configuration line ${i + 1}: expected Header = JSONPath`);
    const left = line.slice(0, sep).trim();
    const right = line.slice(sep + 1).trim();
    if (!left || !right) throw new Error(`Configuration line ${i + 1}: header and value are required`);
    if (left.startsWith('@')) {
      const keys = { '@rows': 'rows', '@format': 'format', '@join': 'join', '@missing': 'missing', '@maxWidth': 'maxWidth', '@max-width': 'maxWidth' };
      const name = keys[left];
      if (!name) throw new Error(`Unknown directive ${left} on line ${i + 1}`);
      let parsed = right;
      if ((name === 'join' || name === 'missing') && right.startsWith('\"')) {
        try { parsed = JSON.parse(right); }
        catch (err) { throw new Error(`Configuration line ${i + 1}: invalid quoted value (${err.message})`); }
      }
      config[name] = name === 'maxWidth' ? Number(right) : parsed;
    } else config.columns.push({ header: left, path: right });
  }
  return config;
}
function validateConfig(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('Configuration must be an object');
  if (!Array.isArray(config.columns) || config.columns.length === 0) throw new Error('At least one column mapping is required');
  const columns = config.columns.map((col, idx) => {
    if (typeof col !== 'object' || !col || Array.isArray(col)) throw new Error(`Column ${idx + 1} must be an object`);
    if (typeof col.header !== 'string' || !col.header.trim()) throw new Error(`Column ${idx + 1} needs a header`);
    if (typeof col.path !== 'string' || !col.path.trim()) throw new Error(`Column '${col.header}' needs a JSONPath`);
    if (col.join !== undefined && typeof col.join !== 'string') throw new Error(`Column '${col.header}' join must be a string`);
    if (col.missing !== undefined && typeof col.missing !== 'string') throw new Error(`Column '${col.header}' missing must be a string`);
    return { ...col };
  });
  const normalized = { rows: '$', join: ', ', missing: '', format: 'table', maxWidth: 0, ...config, columns };
  if (typeof normalized.rows !== 'string' || !normalized.rows.trim()) throw new Error('rows must be a JSONPath');
  if (typeof normalized.join !== 'string' || typeof normalized.missing !== 'string') throw new Error('join and missing must be strings');
  if (!['table', 'csv', 'tsv', 'markdown', 'json'].includes(normalized.format)) throw new Error('format must be table, csv, tsv, markdown, or json');
  if (!Number.isInteger(normalized.maxWidth) || normalized.maxWidth < 0) throw new Error('maxWidth must be a nonnegative integer');
  return normalized;
}
function loadConfig(file) {
  const text = fs.readFileSync(file, 'utf8');
  const jsonConfig = file.toLowerCase().endsWith('.json');
  let parsed;
  if (jsonConfig) {
    try { parsed = JSON.parse(text.replace(/^\uFEFF/, '')); }
    catch (err) { throw new Error(`Invalid JSON config (${file}): ${err.message}`); }
  } else parsed = parseTextConfig(text);
  return validateConfig(parsed);
}
module.exports = { parseTextConfig, validateConfig, loadConfig };
