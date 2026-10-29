#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const { loadConfig, validateConfig } = require('./src/config');
const { parsePath } = require('./src/jsonpath');
const { render } = require('./src/format');

const HELP = `JSON Table Formatter — dependency-free Node.js CLI

Usage:
  node index.js --input INPUT.json --config columns.txt [options]
  node index.js INPUT.json columns.txt [options]
  cat INPUT.json | node index.js --input - --config columns.txt

Options:
  -i, --input FILE     JSON data file (or - for standard input)
  -c, --config FILE    Text mapping file (.txt) or JSON config (.json)
  -f, --format NAME    table (default), csv, tsv, markdown, json
  -o, --output FILE    Write result to a file (default: stdout)
      --max-width N    Truncate each table cell to N Unicode characters (0 = unlimited)
  -h, --help           Show this help

Text configuration example:
  @rows = $.results[*]
  Host = $.target.host
  TLS = $.negotiated.protocol
  Generated = $$.generatedAt

$ starts at the selected row; $$ starts at the input JSON document.
JSONPath supports dotted and bracket properties, [*], indices, unions, slices,
and recursive descent (..). Executable filter expressions are not supported.
`;
function parseArgs(args) {
  const opts = { positionals: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '-h' || a === '--help') opts.help = true;
    else if (['--input', '-i', '--config', '-c', '--format', '-f', '--output', '-o', '--max-width'].includes(a)) {
      if (i + 1 >= args.length) throw new Error(`${a} requires a value`);
      const v = args[++i];
      if (a === '-i' || a === '--input') opts.input = v;
      else if (a === '-c' || a === '--config') opts.config = v;
      else if (a === '-f' || a === '--format') opts.format = v;
      else if (a === '-o' || a === '--output') opts.output = v;
      else opts.maxWidth = Number(v);
    } else if (a.startsWith('-') && a !== '-') throw new Error(`Unknown option: ${a}`);
    else opts.positionals.push(a);
  }
  if (!opts.input && opts.positionals.length) opts.input = opts.positionals.shift();
  if (!opts.config && opts.positionals.length) opts.config = opts.positionals.shift();
  if (opts.positionals.length) throw new Error(`Unexpected positional arguments: ${opts.positionals.join(', ')}`);
  return opts;
}
async function main(args = process.argv.slice(2)) {
  const options = parseArgs(args);
  if (options.help) { process.stdout.write(HELP); return; }
  if (!options.input || !options.config) throw new Error('Both --input and --config are required (see --help)');
  const config = loadConfig(options.config);
  if (options.format !== undefined) config.format = options.format;
  if (options.maxWidth !== undefined) config.maxWidth = options.maxWidth;
  validateConfig(config);
  parsePath(config.rows);
  for (const col of config.columns) parsePath(col.path.startsWith('$$') ? '$' + col.path.slice(2) : col.path);
  const input = options.input === '-' ? await new Promise((resolve, reject) => {
    let text = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => { text += chunk; });
    process.stdin.on('end', () => resolve(text));
    process.stdin.on('error', reject);
  }) : fs.readFileSync(options.input, 'utf8');
  let json;
  try { json = JSON.parse(input.replace(/^\uFEFF/, '')); }
  catch (err) { throw new Error(`Invalid JSON input: ${err.message}`); }
  const result = render(json, config);
  if (options.output && options.output !== '-') fs.writeFileSync(options.output, result, { encoding: 'utf8', mode: 0o600 });
  else process.stdout.write(result);
}
if (require.main === module) {
  main().catch(err => { console.error(`Error: ${err.message}`); process.exitCode = 1; });
}
module.exports = { main, parseArgs };
