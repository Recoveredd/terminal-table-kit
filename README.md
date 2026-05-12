# terminal-table-kit

[![npm version](https://img.shields.io/npm/v/terminal-table-kit.svg)](https://www.npmjs.com/package/terminal-table-kit)
[![License: MPL-2.0](https://img.shields.io/badge/license-MPL--2.0-blue.svg)](LICENSE)
[![CI](https://github.com/Recoveredd/terminal-table-kit/actions/workflows/ci.yml/badge.svg)](https://github.com/Recoveredd/terminal-table-kit/actions/workflows/ci.yml)

Parse terminal table output into JavaScript objects.

`terminal-table-kit` is a small TypeScript utility for tools that need to turn command output into data: CLI wrappers, dashboards, diagnostics, scripts, docs generators and lightweight admin tooling.

Links: [Demo](https://packages.wasta-wocket.fr/terminal-table-kit/) · [npm](https://www.npmjs.com/package/terminal-table-kit) · [GitHub](https://github.com/Recoveredd/terminal-table-kit)

It is inspired by old table parsers such as `table-parser`, but rebuilt as a modern, typed, dependency-free package.

## Package quality

- TypeScript types are generated from the source.
- ESM-only package with no runtime dependencies.
- Marked as side-effect free for bundlers.
- Tested on Node.js 20 and 22 with GitHub Actions.
- Parses terminal output without shelling out or reading files.

## Install

```bash
npm install terminal-table-kit
```

## Quick Start

```ts
import { parseTerminalTable } from 'terminal-table-kit';

const output = `
NAME      READY   STATUS    RESTARTS   AGE
api       1/1     Running   0          4d
worker    0/1     Error     3          2h 14m
`;

parseTerminalTable(output);
// [
//   { NAME: 'api', READY: '1/1', STATUS: 'Running', RESTARTS: '0', AGE: '4d' },
//   { NAME: 'worker', READY: '0/1', STATUS: 'Error', RESTARTS: '3', AGE: '2h 14m' }
// ]
```

## Why

Many useful commands print tables instead of JSON:

- `ps`
- `docker ps`
- `kubectl get pods`
- `systemctl list-units`
- `lsof`
- legacy CLIs and internal tools

Those tables are usually aligned by spaces. `terminal-table-kit` detects the header columns and returns plain objects.

It also preserves the final column as free text by default, which is useful for command columns such as `CMD`, `COMMAND`, `NAMES` or human-readable ages.

Two parsing modes are supported:

- `fixed`: slice rows by detected header column positions, useful for aligned output such as `docker ps`.
- `tokens`: split rows on whitespace, useful for compact headers such as `PID TTY TIME CMD`.

The default `auto` mode chooses between them from the header shape.

## Examples

### Parse `ps`

```ts
const output = `
  PID TTY           TIME CMD
49692 ttys000    0:00.06 login -pfl user /bin/bash -c exec -la bash /bin/bash
49693 ttys000    0:00.06 -bash
`;

parseTerminalTable(output);
// [
//   {
//     PID: '49692',
//     TTY: 'ttys000',
//     TIME: '0:00.06',
//     CMD: 'login -pfl user /bin/bash -c exec -la bash /bin/bash'
//   },
//   { PID: '49693', TTY: 'ttys000', TIME: '0:00.06', CMD: '-bash' }
// ]
```

### Parse multi-word headers

```ts
const output = [
  'CONTAINER ID   IMAGE          COMMAND                  CREATED       STATUS       NAMES',
  'a1b2c3d4e5f6   redis:7        "docker-entrypoint.s"   2 hours ago   Up 2 hours   cache'
].join('\n');

parseTerminalTable(output, { keyStyle: 'camel' });
// [
//   {
//     containerId: 'a1b2c3d4e5f6',
//     image: 'redis:7',
//     command: '"docker-entrypoint.s"',
//     created: '2 hours ago',
//     status: 'Up 2 hours',
//     names: 'cache'
//   }
// ]
```

### Use explicit keys

```ts
parseTerminalTable(output, {
  headers: ['pid', 'tty', 'time', 'command']
});
```

### Force a parsing mode

```ts
parseTerminalTable(output, { mode: 'tokens' });
parseTerminalTable(output, { mode: 'fixed' });
```

### Convert parsed rows to Markdown

`terminal-table-kit` only parses strings. Pair it with `array-table-kit` when you want Markdown or HTML table output.

```ts
import { arrayToMarkdownTable } from 'array-table-kit';
import { parseTerminalTable } from 'terminal-table-kit';

const rows = parseTerminalTable(output, {
  keyStyle: 'camel'
});

const markdown = arrayToMarkdownTable(rows);
```

For browser previews or support dashboards, render parsed rows with `json-html-kit`.

For CSV exports from parsed terminal rows, use `json-csv-kit`:

```ts
import { jsonToCsv } from 'json-csv-kit';
import { parseTerminalTable } from 'terminal-table-kit';

const rows = parseTerminalTable(output, {
  keyStyle: 'camel'
});

const csv = jsonToCsv(rows);
```

### Inspect detected columns

```ts
import { parseTerminalTableModel } from 'terminal-table-kit';

const model = parseTerminalTableModel(output);

model.columns;
// [
//   { header: 'PID', key: 'PID', start: 2, end: 6 },
//   { header: 'TTY', key: 'TTY', start: 6, end: 20 },
//   ...
// ]

model.mode;
// fixed
```

## API

### `parseTerminalTable(input, options?)`

Returns parsed rows.

```ts
parseTerminalTable(input: string, options?: ParseTerminalTableOptions): TerminalTableRow[]
```

### `parseTerminalTableModel(input, options?)`

Returns detected columns and parsed rows.

```ts
parseTerminalTableModel(input: string, options?: ParseTerminalTableOptions): TerminalTableModel
```

### `createColumnKey(header, keyStyle?)`

Converts a header to a key.

```ts
createColumnKey('CONTAINER ID', 'camel');
// containerId
```

### `stripAnsi(input)`

Removes ANSI escape sequences.

```ts
stripAnsi('\u001B[32mRunning\u001B[0m');
// Running
```

## Options

```ts
interface ParseTerminalTableOptions {
  columnKeys?: readonly string[] | ((header: string, index: number) => string);
  headers?: readonly string[] | ((header: string, index: number) => string);
  headerLine?: number;
  keyStyle?: 'preserve' | 'camel' | 'snake';
  maxRows?: number;
  mode?: 'auto' | 'fixed' | 'tokens';
  preserveLastColumn?: boolean;
  separator?: RegExp;
  skipEmptyLines?: boolean;
  stripAnsi?: boolean;
  trimCells?: boolean;
}
```

| Option | Default | Description |
| --- | --- | --- |
| `columnKeys` | detected headers | Explicit row keys, or a function that maps headers to keys. |
| `headers` | detected headers | Friendly alias for `columnKeys`. |
| `headerLine` | `0` | Index of the header line after optional empty-line filtering. |
| `keyStyle` | `preserve` | Keep headers as keys, or convert to `camel` / `snake`. |
| `maxRows` | unlimited | Parse at most this many body rows. |
| `mode` | `auto` | Let the parser choose, or force `fixed` / `tokens`. |
| `preserveLastColumn` | `true` | Let the final column consume the rest of the row. |
| `separator` | `/[ \t]{2,}/g` | Separator used to detect multi-word headers. Falls back to whitespace tokens. |
| `skipEmptyLines` | `true` | Remove empty lines before parsing. |
| `stripAnsi` | `true` | Remove ANSI colors before parsing. |
| `trimCells` | `true` | Trim parsed cell values. |

If both `columnKeys` and `headers` are provided, `columnKeys` wins.

## Types

```ts
type ColumnKeyStyle = 'preserve' | 'camel' | 'snake';
type ParseMode = 'auto' | 'fixed' | 'tokens';
type TerminalTableRow = Record<string, string>;
```

## Notes

- This library is for aligned terminal tables, not CSV.
- It does not execute commands; it only parses strings.
- Detection works best when the selected header line visually matches the following rows.
- `fixed` mode expects column-aligned rows. If the output is only whitespace-separated, force `mode: 'tokens'`.
- For commands that can output JSON natively, prefer the command's JSON mode.

## License

MPL-2.0
