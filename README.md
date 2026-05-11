# terminal-table-kit

Parse fixed-width terminal table output into JavaScript objects.

`terminal-table-kit` is a small TypeScript utility for tools that need to turn command output into data: CLI wrappers, dashboards, diagnostics, scripts, docs generators and lightweight admin tooling.

It is inspired by old table parsers such as `table-parser`, but rebuilt as a modern, typed, dependency-free package.

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

Those tables are usually aligned by spaces. `terminal-table-kit` detects the header columns, slices each row using the same column starts and returns plain objects.

It also preserves the final column as free text by default, which is useful for command columns such as `CMD`, `COMMAND`, `NAMES` or human-readable ages.

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
  'CONTAINER ID   IMAGE       COMMAND                  CREATED       STATUS       NAMES',
  'a1b2c3d4e5f6   redis:7     "docker-entrypoint.s"   2 hours ago   Up 2 hours   cache'
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
  columnKeys: ['pid', 'tty', 'time', 'command']
});
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
  headerLine?: number;
  keyStyle?: 'preserve' | 'camel' | 'snake';
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
| `headerLine` | `0` | Index of the header line after optional empty-line filtering. |
| `keyStyle` | `preserve` | Keep headers as keys, or convert to `camel` / `snake`. |
| `preserveLastColumn` | `true` | Let the final column consume the rest of the row. |
| `separator` | `/[ \t]{2,}/g` | Separator used to detect multi-word headers. Falls back to whitespace tokens. |
| `skipEmptyLines` | `true` | Remove empty lines before parsing. |
| `stripAnsi` | `true` | Remove ANSI colors before parsing. |
| `trimCells` | `true` | Trim parsed cell values. |

## Notes

- This library is for aligned terminal tables, not CSV.
- It does not execute commands; it only parses strings.
- Detection works best when the first non-empty line is the header.
- For commands that can output JSON natively, prefer the command's JSON mode.

## License

MIT
