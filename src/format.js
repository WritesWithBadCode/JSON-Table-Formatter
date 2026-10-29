'use strict';
const { query } = require('./jsonpath');

function valueToString(value, join) {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.map(v => valueToString(v, join)).filter(Boolean).join(join);
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
function getRows(data, config) {
  const rowObjs = query(data, config.rows);
  const selected = config.rows === '$' && Array.isArray(data) ? data : rowObjs;
  return selected.map(row => Object.fromEntries(config.columns.map(col => {
    // $$ = original document; $ (or implicit) = current row.
    let path = col.path.trim(), context = row;
    if (path.startsWith('$$')) { context = data; path = `$${path.slice(2)}`; }
    const values = query(context, path);
    const join = col.join ?? config.join;
    const missing = col.missing ?? config.missing;
    const text = values.flatMap(value => Array.isArray(value) ? value : [value])
      .filter(v => v !== undefined && v !== null)
      .map(v => valueToString(v, join))
      .filter(v => v !== '');
    return [col.header, text.length ? text.join(join) : missing];
  })));
}
function safeLine(value) {
  return String(value).replace(/\x1b(?:\[[0-?]*[ -/]*[@-~])?/g, '')
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, c => c === '\n' ? '\\n' : c === '\t' ? '\\t' : c === '\r' ? '\\r' : '');
}
function codepointLength(s) { return Array.from(s).length; }
function clip(value, maxWidth) {
  const text = safeLine(value);
  if (!maxWidth || codepointLength(text) <= maxWidth) return text;
  return maxWidth === 1 ? '…' : Array.from(text).slice(0, maxWidth - 1).join('') + '…';
}
function renderTable(rows, headers, maxWidth) {
  const formatted = rows.map(row => headers.map(h => clip(row[h], maxWidth)));
  const titles = headers.map(h => clip(h, maxWidth));
  const widths = titles.map((h, i) => Math.max(codepointLength(h), ...formatted.map(row => codepointLength(row[i]))));
  const sep = '+' + widths.map(w => '-'.repeat(w + 2)).join('+') + '+';
  const line = cells => '| ' + cells.map((value, i) => value.padEnd(widths[i] + value.length - codepointLength(value), ' ')).join(' | ') + ' |';
  return [sep, line(titles), sep, ...formatted.map(line), sep].join('\n') + '\n';
}
function renderCSV(rows, headers, delimiter) {
  function quote(value) {
    const s = String(value);
    return s.includes('"') || s.includes(delimiter) || /[\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }
  return [headers.map(quote).join(delimiter), ...rows.map(row => headers.map(h => quote(row[h])).join(delimiter))].join('\n') + '\n';
}
function renderMarkdown(rows, headers) {
  const escape = value => safeLine(value).replace(/\|/g, '\\|');
  return ['| ' + headers.map(escape).join(' | ') + ' |', '| ' + headers.map(() => '---').join(' | ') + ' |',
    ...rows.map(row => '| ' + headers.map(h => escape(row[h])).join(' | ') + ' |')].join('\n') + '\n';
}
function render(data, config) {
  const rows = getRows(data, config);
  const headers = config.columns.map(c => c.header);
  if (new Set(headers).size !== headers.length) throw new Error('Column headers must be unique');
  switch (config.format) {
    case 'csv': return renderCSV(rows, headers, ',');
    case 'tsv': return renderCSV(rows, headers, '\t');
    case 'markdown': return renderMarkdown(rows, headers);
    case 'json': return JSON.stringify(rows, null, 2) + '\n';
    case 'table': return renderTable(rows, headers, config.maxWidth);
    default: throw new Error(`Unknown output format ${config.format}`);
  }
}
module.exports = { getRows, render, renderTable, renderCSV, renderMarkdown };
