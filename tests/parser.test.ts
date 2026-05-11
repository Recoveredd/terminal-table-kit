import { describe, expect, it } from 'vitest';
import {
  createColumnKey,
  parseTerminalTable,
  parseTerminalTableModel,
  stripAnsi,
  TableParseError
} from '../src/index.js';

describe('terminal-table-kit', () => {
  it('parses ps-style terminal output with whitespace headers', () => {
    const input = `
  PID TTY           TIME CMD
49692 ttys000    0:00.06 login -pfl user /bin/bash -c exec -la bash /bin/bash
49693 ttys000    0:00.06 -bash
56464 ttys005    0:00.01 ps -a
`;

    expect(parseTerminalTable(input)).toEqual([
      {
        PID: '49692',
        TTY: 'ttys000',
        TIME: '0:00.06',
        CMD: 'login -pfl user /bin/bash -c exec -la bash /bin/bash'
      },
      {
        PID: '49693',
        TTY: 'ttys000',
        TIME: '0:00.06',
        CMD: '-bash'
      },
      {
        PID: '56464',
        TTY: 'ttys005',
        TIME: '0:00.01',
        CMD: 'ps -a'
      }
    ]);
  });

  it('parses docker ps output with multi-word headers', () => {
    const widths = [15, 15, 25, 17, 16, 10];
    const row = (...cells: string[]) => cells
      .map((cell, index) => index < widths.length ? cell.padEnd(widths[index] ?? 0, ' ') : cell)
      .join('');
    const input = [
      row('CONTAINER ID', 'IMAGE', 'COMMAND', 'CREATED', 'STATUS', 'PORTS', 'NAMES'),
      row('a1b2c3d4e5f6', 'redis:7', '"docker-entrypoint.s"', '2 hours ago', 'Up 2 hours', '6379/tcp', 'cache'),
      row('bbccddeeff00', 'postgres:16', '"docker-entrypoint.s"', '12 minutes ago', 'Up 12 minutes', '5432/tcp', 'database')
    ].join('\n');

    const rows = parseTerminalTable(input, { keyStyle: 'camel' });

    expect(rows[0]).toEqual({
      containerId: 'a1b2c3d4e5f6',
      image: 'redis:7',
      command: '"docker-entrypoint.s"',
      created: '2 hours ago',
      status: 'Up 2 hours',
      ports: '6379/tcp',
      names: 'cache'
    });
    expect(rows[1]?.containerId).toBe('bbccddeeff00');
  });

  it('preserves the final column as free text', () => {
    const input = [
      'NAME      READY   STATUS    RESTARTS   AGE',
      'api       1/1     Running   0          4d',
      'worker    0/1     Error     3          2h 14m'
    ].join('\n');

    expect(parseTerminalTable(input)[1]?.AGE).toBe('2h 14m');
  });

  it('returns a model with detected column metadata', () => {
    const input = [
      'NAME      READY   STATUS',
      'api       1/1     Running'
    ].join('\n');

    const model = parseTerminalTableModel(input, { keyStyle: 'snake' });

    expect(model.columns).toEqual([
      { header: 'NAME', key: 'name', start: 0, end: 10 },
      { header: 'READY', key: 'ready', start: 10, end: 18 },
      { header: 'STATUS', key: 'status', start: 18 }
    ]);
    expect(model.mode).toBe('fixed');
    expect(model.rows).toEqual([
      { name: 'api', ready: '1/1', status: 'Running' }
    ]);
  });

  it('can force token parsing when automatic detection would choose fixed columns', () => {
    const input = [
      'NAME      STATUS',
      'api       Running'
    ].join('\n');

    expect(parseTerminalTableModel(input, { mode: 'tokens' }).mode).toBe('tokens');
    expect(parseTerminalTable(input, { mode: 'tokens' })).toEqual([
      { NAME: 'api', STATUS: 'Running' }
    ]);
  });

  it('supports explicit column keys', () => {
    const input = [
      'PID TTY           TIME CMD',
      '1   ttys000    0:00.01 node server.js'
    ].join('\n');

    expect(parseTerminalTable(input, {
      columnKeys: ['pid', 'tty', 'time', 'command']
    })).toEqual([
      {
        pid: '1',
        tty: 'ttys000',
        time: '0:00.01',
        command: 'node server.js'
      }
    ]);
  });

  it('supports headers as a user-friendly alias for column keys', () => {
    const input = [
      'PID TTY           TIME CMD',
      '1   ttys000    0:00.01 node server.js'
    ].join('\n');

    expect(parseTerminalTable(input, {
      headers: ['pid', 'tty', 'time', 'command']
    })[0]?.command).toBe('node server.js');
  });

  it('lets columnKeys take priority over the headers alias', () => {
    const input = [
      'PID TTY           TIME CMD',
      '1   ttys000    0:00.01 node server.js'
    ].join('\n');

    expect(parseTerminalTable(input, {
      columnKeys: ['pid', 'tty', 'time', 'command'],
      headers: ['processId']
    })[0]?.pid).toBe('1');
  });

  it('strips ANSI escape sequences by default', () => {
    const input = [
      'NAME      STATUS',
      '\u001B[32mapi\u001B[0m       \u001B[32mRunning\u001B[0m'
    ].join('\n');

    expect(stripAnsi('\u001B[32mRunning\u001B[0m')).toBe('Running');
    expect(parseTerminalTable(input)).toEqual([
      { NAME: 'api', STATUS: 'Running' }
    ]);
  });

  it('can keep raw cell padding', () => {
    const input = [
      'NAME      STATUS',
      'api       Running'
    ].join('\n');

    expect(parseTerminalTable(input, { trimCells: false })[0]?.NAME).toBe('api       ');
  });

  it('can disable greedy final-column parsing', () => {
    const input = [
      'A    B    C',
      'one  two  three four'
    ].join('\n');

    expect(parseTerminalTable(input, { preserveLastColumn: false })[0]?.C).toBe('three');
  });

  it('supports a later header line', () => {
    const input = [
      'Pods in default namespace',
      'NAME      STATUS',
      'api       Running'
    ].join('\n');

    expect(parseTerminalTable(input, { headerLine: 1 })).toEqual([
      { NAME: 'api', STATUS: 'Running' }
    ]);
  });

  it('throws a clear error when the header line is outside the input', () => {
    expect(() => parseTerminalTable('NAME\napi', { headerLine: 4 })).toThrow(TableParseError);
  });

  it('throws a clear error for non-string input', () => {
    expect(() => parseTerminalTable(['NAME'] as unknown as string)).toThrow('terminal-table-kit expects a string input.');
  });

  it('normalizes invalid runtime options from JavaScript callers', () => {
    const input = [
      'NAME      STATUS',
      'api       Running'
    ].join('\n');

    const model = parseTerminalTableModel(input, {
      headerLine: Number.NaN,
      keyStyle: 'loud' as never,
      mode: 'guess' as never
    });

    expect(model.mode).toBe('fixed');
    expect(model.rows).toEqual([{ NAME: 'api', STATUS: 'Running' }]);
  });

  it('returns empty output for empty input', () => {
    expect(parseTerminalTable('')).toEqual([]);
    expect(parseTerminalTableModel('')).toEqual({ columns: [], mode: 'tokens', rows: [] });
    expect(parseTerminalTableModel('', { mode: 'fixed' })).toEqual({ columns: [], mode: 'fixed', rows: [] });
  });

  it('creates normalized keys', () => {
    expect(createColumnKey('CONTAINER ID', 'camel')).toBe('containerId');
    expect(createColumnKey('CONTAINER ID', 'snake')).toBe('container_id');
    expect(createColumnKey('CONTAINER ID')).toBe('CONTAINER ID');
  });
});
