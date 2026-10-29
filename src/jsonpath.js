'use strict';

// A deliberately non-executable JSONPath subset. No JavaScript evaluation or filters.
// Supported: $, ., brackets, quoted names, wildcards, unions, slices, and recursive descent.
function splitUnquoted(input, separator) {
  const result = [];
  let quoted = null, escaped = false, part = '';
  for (const char of input) {
    if (escaped) { part += char; escaped = false; continue; }
    if (char === '\\' && quoted) { part += char; escaped = true; continue; }
    if (quoted) {
      if (char === quoted) quoted = null;
      part += char;
      continue;
    }
    if (char === '"' || char === "'") { quoted = char; part += char; continue; }
    if (char === separator) { result.push(part.trim()); part = ''; continue; }
    part += char;
  }
  if (quoted) throw new Error('Unterminated quoted property in JSONPath');
  result.push(part.trim());
  return result;
}
function quotedName(s) {
  if (s.length < 2 || s[s.length - 1] !== s[0]) throw new Error(`Invalid quoted property ${s}`);
  if (s[0] === '"') {
    try { return JSON.parse(s); } catch { throw new Error(`Invalid JSONPath property name: ${s}`); }
  }
  // JSONPath permits single quotes. Decode common escapes without evaluating code.
  return s.slice(1, -1).replace(/\\(u[0-9a-fA-F]{4}|.)/g, (match, escaped) => {
    if (escaped[0] === 'u' && escaped.length === 5) return String.fromCharCode(parseInt(escaped.slice(1), 16));
    const chars = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '\\': '\\', "'": "'", '"': '"', '/': '/' };
    return Object.hasOwn(chars, escaped) ? chars[escaped] : escaped;
  });
}
function parseSelector(text) {
  const selector = text.trim();
  if (!selector) throw new Error('Empty bracket selector in JSONPath');
  if (selector.startsWith('?')) throw new Error('JSONPath filter expressions are not supported (no code evaluation)');
  const entries = splitUnquoted(selector, ',');
  if (entries.length > 1) return { type: 'union', selectors: entries.map(entry => parseSelector(entry)) };
  const part = entries[0];
  if (part === '*') return { type: 'wildcard' };
  if (/^[+-]?\d+$/.test(part)) return { type: 'index', index: Number(part) };
  if (/^(?:-?\d+)?:(?:-?\d+)?(?::(?:-?\d+)?)?$/.test(part)) {
    const [start, end, step] = part.split(':');
    const nstep = step === undefined || step === '' ? 1 : Number(step);
    if (nstep === 0) throw new Error('JSONPath slice step cannot be zero');
    return { type: 'slice', start: start === '' ? null : Number(start), end: end === '' ? null : Number(end), step: nstep };
  }
  if (part.startsWith('"') || part.startsWith("'")) return { type: 'property', key: quotedName(part) };
  throw new Error(`Unsupported JSONPath bracket selector: [${text}]`);
}
function parsePath(path) {
  if (typeof path !== 'string' || !path.trim()) throw new Error('JSONPath must be a nonempty string');
  let p = path.trim();
  if (p[0] !== '$' && p[0] !== '@') p = p[0] === '[' ? `$${p}` : `$.${p}`;
  let i = 1;
  const tokens = [];
  while (i < p.length) {
    let recursive = false;
    if (p[i] === '.') {
      i++;
      if (p[i] === '.') { recursive = true; i++; }
      if (i >= p.length) throw new Error(`JSONPath cannot end with a dot: ${path}`);
    } else if (p[i] !== '[') {
      throw new Error(`Unexpected character '${p[i]}' at position ${i} in JSONPath: ${path}`);
    }
    let token;
    if (p[i] === '[') {
      i++;
      let quote = null, escaped = false, content = '', closed = false;
      while (i < p.length) {
        const char = p[i++];
        if (escaped) { content += char; escaped = false; continue; }
        if (quote && char === '\\') { content += char; escaped = true; continue; }
        if (char === quote) { quote = null; content += char; continue; }
        if (!quote && (char === "'" || char === '"')) { quote = char; content += char; continue; }
        if (!quote && char === ']') { closed = true; break; }
        content += char;
      }
      if (!closed) throw new Error(`Unclosed bracket selector in JSONPath: ${path}`);
      token = parseSelector(content);
    } else {
      const begin = i;
      while (i < p.length && p[i] !== '.' && p[i] !== '[') i++;
      const key = p.slice(begin, i);
      if (!key || key.includes(']')) throw new Error(`Invalid JSONPath property at position ${begin}: ${path}`);
      token = key === '*' ? { type: 'wildcard' } : { type: 'property', key };
    }
    if (recursive) token = { type: 'recursive', selector: token };
    tokens.push(token);
  }
  return tokens;
}
function children(node) {
  if (node === null || typeof node !== 'object') return [];
  return Array.isArray(node) ? node : Object.values(node);
}
function apply(node, token) {
  if (node === null || typeof node !== 'object') return [];
  switch (token.type) {
    case 'property':
      return Object.hasOwn(node, token.key) ? [node[token.key]] : [];
    case 'index': {
      if (!Array.isArray(node) || !Number.isSafeInteger(token.index)) return [];
      const at = token.index < 0 ? node.length + token.index : token.index;
      return at >= 0 && at < node.length ? [node[at]] : [];
    }
    case 'wildcard': return children(node);
    case 'union': return token.selectors.flatMap(item => apply(node, item));
    case 'slice': {
      if (!Array.isArray(node)) return [];
      const len = node.length, step = token.step;
      const clamp = (i, lo, hi) => Math.min(hi, Math.max(lo, i));
      const norm = i => i < 0 ? len + i : i;
      const start = token.start === null ? (step > 0 ? 0 : len - 1) : clamp(norm(token.start), step > 0 ? 0 : -1, step > 0 ? len : len - 1);
      const end = token.end === null ? (step > 0 ? len : -1) : clamp(norm(token.end), step > 0 ? 0 : -1, step > 0 ? len : len - 1);
      const result = [];
      for (let i = start; step > 0 ? i < end : i > end; i += step) result.push(node[i]);
      return result;
    }
    case 'recursive': {
      const out = [], stack = [node];
      while (stack.length) {
        const current = stack.pop();
        out.push(...apply(current, token.selector));
        const subs = children(current);
        for (let k = subs.length - 1; k >= 0; k--) stack.push(subs[k]);
      }
      return out;
    }
    default: throw new Error(`Unsupported JSONPath token: ${token.type}`);
  }
}
function query(data, path) {
  const tokens = parsePath(path);
  let nodes = [data];
  for (const token of tokens) {
    nodes = nodes.flatMap(node => apply(node, token));
    if (!nodes.length) break;
  }
  return nodes;
}
module.exports = { parsePath, query };
