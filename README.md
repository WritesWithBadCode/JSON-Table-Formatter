# JSON Table Formatter (Node.js)

A small, general-purpose command-line tool that selects data from **any valid JSON file** using configurable JSONPaths and displays the requested values as a table. It is compatible with the separate TLS Inventory scanner, but has no dependency on the scanner or its file format.

**Node.js 20+; no `npm install` required.** Uses only Node.js built-in modules. Does not execute code from the JSON data or the configuration file.

## Quick start

```bash
# In the json-table-formatter directory:
node index.js --input examples/tls-results.json --config examples/tls-columns.txt

# The same mappings, as a CSV file:
node index.js -i examples/tls-results.json -c examples/tls-columns.txt --format csv --output report.csv

# Another JSON document, using completely different column mappings:
node index.js examples/generic.json examples/generic-columns.txt

# Data can also be piped in:
cat examples/generic.json | node index.js --input - --config examples/generic-columns.txt

# Execute the included test suite:
npm test
```

## Text configuration format

Create a plain-text UTF-8 file with `@rows` and one `Header = JSONPath` mapping per desired column. The mapping order sets the column order.

```ini
# tls-columns.txt
@rows = $.results[*]
@join = "; "
@missing = -
@maxWidth = 45

Hostname = $.target.host
Port = $.target.port
Success = $.success
TLS Version = $.negotiated.protocol
Cipher = $.negotiated.cipher.name
Remote IP = $.endpoints.remoteAddress
Subject = $.certificates[0].subject
DNS SANs = $.certificates[0].dnsNames[*]
IP SANs = $.certificates[0].ipAddresses[*]
Subject Key ID = $.certificates[0].subjectKeyIdentifier
Authority Key ID = $.certificates[0].authorityKeyIdentifier.keyIdentifier
Key Usage = $.certificates[0].keyUsage[*]
CA = $.certificates[0].basicConstraints.ca
Valid From = $.certificates[0].validity.notBefore
Valid Until = $.certificates[0].validity.notAfter
Error = $.error.message
Generated At = $$.generatedAt
```

The project contains a larger ready-made TLS mapping in [`examples/tls-columns.txt`](examples/tls-columns.txt), covering additional certificate fields such as the fingerprint, serial number, and extended key usage.

### Selecting rows

- `@rows = $.results[*]` produces one row per element of `results` (appropriate for the TLS scanner).
- `@rows = $.employees[*]` produces one row per employee in another arbitrary JSON file.
- If `@rows` is omitted, a top-level JSON array produces one row per element; a top-level JSON object produces one row.
- When `@rows` matches no objects, only the header is printed.

### Path scopes

- **`$`** refers to the **current row** selected by `@rows`. For example `$.target.host` finds the host inside each scan result.
- **`$$`** refers to the **entire original JSON input** regardless of the selected row. For example, `$$.generatedAt` repeats the scan timestamp in every row.
- For simple properties, you can omit `$.` and write `target.host` instead.

### Supported path expressions

| Syntax | Meaning |
|---|---|
| `$.name` | Object property |
| `$.address.city` | Nested property |
| `$['unusual.key']` or `$["unusual.key"]` | Quoted property name |
| `$.items[0]` | First array element |
| `$.items[-1]` | Last array element |
| `$.items[*].name` | Values from every element |
| `$.items[0,2]` | Union of two array elements |
| `$.items[1:4]` | Array slice (end exclusive) |
| `$.items[::-1]` | Reverse array slice |
| `$..serialNumber` | Recursive property lookup |
| `$` | Entire selected row |

This is an intentionally **safe subset** of JSONPath, not the entire JSONPath specification. In particular, executable filters like `[?(@.price > 10)]` and computed/script expressions are **not supported**. Use a trusted JSON transformation tool for those operations if needed. Paths cannot be used to execute JavaScript.

### Directives

| Directive | Purpose | Default |
|---|---|---|
| `@rows` | JSONPath that chooses table records | Entire input (`$`) |
| `@format` | `table`, `csv`, `tsv`, `markdown`, `json` | `table` |
| `@join` | Separator between multiple values for a column | `, ` |
| `@missing` | Text displayed for absent/null/empty values | Empty string |
| `@maxWidth` | Maximum width of each terminal-table cell; `0` means unlimited | `0` |

Use double quotes (JSON string syntax) to preserve whitespace in `@join` or `@missing`; for example `@join = "; "`. Comments may start with `#` or `//` on their own lines. Column lines may use a tab in place of the equals sign. The row list preserves its source order. Multiple matches for a column are joined into one cell; arrays of primitive values are joined similarly, and JSON objects are rendered compactly using `JSON.stringify`.

A missing path does not stop processing; that column gets the configured missing-value placeholder. Values `0` and `false` remain visible. If you wish to display every certificate in a chain, use `$.certificates[*].subject` (joined in one cell); `$.certificates[0]` selects only the peer/leaf certificate.

## JSON config alternative

A configuration ending in `.json` is also supported for richer settings, including per-column `join` and `missing` overrides:

```json
{
  "rows": "$.results[*]",
  "format": "csv",
  "missing": "-",
  "maxWidth": 0,
  "columns": [
    { "header": "Host", "path": "$.target.host" },
    { "header": "SANs", "path": "$.certificates[0].dnsNames[*]", "join": "; " },
    { "header": "Scan Time", "path": "$$.generatedAt" }
  ]
}
```

See [`examples/config.json`](examples/config.json) for a generic example.

## CLI switches

```text
node index.js -i INPUT.json -c columns.txt [-f table|csv|tsv|markdown|json] [-o FILE] [--max-width N]
node index.js INPUT.json columns.txt
```

| Option | Description |
|---|---|
| `-i`, `--input FILE` | JSON input file, or `-` to read standard input |
| `-c`, `--config FILE` | `.txt` mappings or `.json` config |
| `-f`, `--format FORMAT` | Override file-config output format |
| `-o`, `--output FILE` | Write to a file instead of stdout |
| `--max-width N` | Override table column width limit, with `0` meaning no truncation |
| `-h`, `--help` | Usage help |

The `table` format is an ASCII bordered terminal table; it normalizes embedded line breaks to visible `\\n` and strips terminal escape controls. `csv` and `tsv` use standards-style quoting for embedded separators, quotes and newlines. `markdown` produces a GitHub-flavored Markdown table. `json` produces an array of records using the configured header names as keys and string-rendered values as properties. Truncation is only applied to `table` output, not data exports.

**Note for spreadsheets:** CSV data can contain strings beginning with `=`, `+`, `-`, or `@` that spreadsheet applications interpret as formulas. Treat untrusted JSON values with appropriate caution when importing CSV into spreadsheet programs.

## Combined TLS scanner workflow

```bash
# From the original tls-inventory directory:
node index.js --config targets.yaml --output scan-results.json

# From the json-table-formatter directory (change paths if needed):
node index.js --input ../tls-inventory/scan-results.json --config examples/tls-columns.txt --format csv --output tls-report.csv
```

The formatter reads the scan results as a separate post-processing step; it never contacts the scanned endpoints. The included sample TLS result uses **fictional illustrative values**, not live scan output.

## Running tests

```bash
npm test
```

Uses built-in `node:test` without extra packages.
