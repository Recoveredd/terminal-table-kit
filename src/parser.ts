import { TableParseError } from './errors.js';
import type {
  ColumnKeyStyle,
  ParseMode,
  ParseTerminalTableOptions,
  TerminalTableColumn,
  TerminalTableModel,
  TerminalTableRow
} from './types.js';

const ANSI_PATTERN = /\u001B\[[0-?]*[ -/]*[@-~]/g;
const DEFAULT_SEPARATOR = /[ \t]{2,}/g;

interface ResolvedOptions {
  columnKeys: readonly string[] | ((header: string, index: number) => string) | undefined;
  headerLine: number;
  keyStyle: ColumnKeyStyle;
  mode: ParseMode;
  preserveLastColumn: boolean;
  separator: RegExp;
  skipEmptyLines: boolean;
  stripAnsi: boolean;
  trimCells: boolean;
}

type DetectedParseMode = Exclude<ParseMode, 'auto'>;
type DetectedColumn = Omit<TerminalTableColumn, 'key'>;

interface ColumnDetection {
  columns: DetectedColumn[];
  mode: DetectedParseMode;
}

export function parseTerminalTable(input: string, options: ParseTerminalTableOptions = {}): TerminalTableRow[] {
  return parseTerminalTableModel(input, options).rows;
}

export function parseTerminalTableModel(input: string, options: ParseTerminalTableOptions = {}): TerminalTableModel {
  if (typeof input !== 'string') {
    throw new TypeError('terminal-table-kit expects a string input.');
  }

  const settings = resolveOptions(options);
  const lines = normalizeInput(input, settings);

  if (lines.length === 0) {
    return { columns: [], mode: settings.mode === 'fixed' ? 'fixed' : 'tokens', rows: [] };
  }

  if (settings.headerLine < 0 || settings.headerLine >= lines.length) {
    throw new TableParseError(`Header line ${settings.headerLine} is outside the input range.`);
  }

  const header = lines[settings.headerLine] ?? '';
  const detection = resolveColumns(header, settings);
  const columns = detection.columns;
  const rows = lines
    .slice(settings.headerLine + 1)
    .map((line) => parseRow(line, columns, detection.mode, settings))
    .filter((row) => Object.values(row).some((value) => value !== ''));

  return { columns, mode: detection.mode, rows };
}

export function stripAnsi(input: string): string {
  return input.replace(ANSI_PATTERN, '');
}

export function createColumnKey(header: string, keyStyle: ColumnKeyStyle = 'preserve'): string {
  if (keyStyle === 'preserve') {
    return header;
  }

  const words = header
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(' ')
    .filter(Boolean);

  if (words.length === 0) {
    return '';
  }

  if (keyStyle === 'snake') {
    return words.map((word) => word.toLowerCase()).join('_');
  }

  return words
    .map((word, index) => {
      const lower = word.toLowerCase();
      return index === 0 ? lower : `${lower.charAt(0).toUpperCase()}${lower.slice(1)}`;
    })
    .join('');
}

function resolveOptions(options: ParseTerminalTableOptions): ResolvedOptions {
  return {
    columnKeys: options.columnKeys ?? options.headers,
    headerLine: normalizeHeaderLine(options.headerLine),
    keyStyle: normalizeKeyStyle(options.keyStyle),
    mode: normalizeMode(options.mode),
    preserveLastColumn: options.preserveLastColumn ?? true,
    separator: options.separator ?? DEFAULT_SEPARATOR,
    skipEmptyLines: options.skipEmptyLines ?? true,
    stripAnsi: options.stripAnsi ?? true,
    trimCells: options.trimCells ?? true
  };
}

function normalizeHeaderLine(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return 0;
  }

  return Math.floor(value);
}

function normalizeKeyStyle(value: unknown): ColumnKeyStyle {
  if (value === 'camel' || value === 'snake') {
    return value;
  }

  return 'preserve';
}

function normalizeMode(value: unknown): ParseMode {
  if (value === 'fixed' || value === 'tokens') {
    return value;
  }

  return 'auto';
}

function normalizeInput(input: string, options: ResolvedOptions): string[] {
  const normalized = input.replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n').map((line) => {
    const text = options.stripAnsi ? stripAnsi(line) : line;
    return text.trimEnd();
  });

  return options.skipEmptyLines ? lines.filter((line) => line.trim() !== '') : lines;
}

function resolveColumns(header: string, options: ResolvedOptions): { columns: TerminalTableColumn[]; mode: DetectedParseMode } {
  const detection = detectColumns(header, options);

  if (detection.columns.length === 0) {
    throw new TableParseError('Unable to detect table columns from the header line.');
  }

  return {
    mode: detection.mode,
    columns: detection.columns.map((column, index) => ({
      ...column,
      key: resolveColumnKey(column.header, index, options)
    }))
  };
}

function detectColumns(header: string, options: ResolvedOptions): ColumnDetection {
  const separated = detectColumnsBySeparator(header, options.separator);
  const whitespace = detectColumnsByWhitespace(header);

  if (options.mode === 'fixed') {
    return { columns: separated, mode: 'fixed' };
  }

  if (options.mode === 'tokens') {
    return { columns: whitespace, mode: 'tokens' };
  }

  if (Array.isArray(options.columnKeys) && options.columnKeys.length > separated.length) {
    return { columns: whitespace, mode: 'tokens' };
  }

  if (separated.length > 2) {
    return { columns: separated, mode: 'fixed' };
  }

  return whitespace.length > separated.length
    ? { columns: whitespace, mode: 'tokens' }
    : { columns: separated, mode: 'fixed' };
}

function detectColumnsBySeparator(header: string, separator: RegExp): DetectedColumn[] {
  const regex = cloneGlobalRegex(separator);
  const columns: DetectedColumn[] = [];
  let segmentStart = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(header)) !== null) {
    pushHeaderSegment(columns, header, segmentStart, match.index);
    segmentStart = match.index + match[0].length;

    if (match[0].length === 0) {
      regex.lastIndex += 1;
    }
  }

  pushHeaderSegment(columns, header, segmentStart, header.length);
  return withColumnEnds(columns);
}

function detectColumnsByWhitespace(header: string): DetectedColumn[] {
  const columns: DetectedColumn[] = [];
  const regex = /\S+/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(header)) !== null) {
    columns.push({
      header: match[0],
      start: match.index
    });
  }

  return withColumnEnds(columns);
}

function pushHeaderSegment(
  columns: DetectedColumn[],
  header: string,
  rawStart: number,
  rawEnd: number
): void {
  const raw = header.slice(rawStart, rawEnd);
  const text = raw.trim();

  if (text === '') {
    return;
  }

  const leading = raw.search(/\S/u);
  const start = rawStart + Math.max(leading, 0);

  columns.push({
    header: text,
    start
  });
}

function withColumnEnds(
  columns: DetectedColumn[]
): DetectedColumn[] {
  return columns.map((column, index) => {
    const next = columns[index + 1];
    return next ? { ...column, end: next.start } : column;
  });
}

function resolveColumnKey(header: string, index: number, options: ResolvedOptions): string {
  if (Array.isArray(options.columnKeys)) {
    return options.columnKeys[index] ?? createColumnKey(header, options.keyStyle);
  }

  if (typeof options.columnKeys === 'function') {
    return options.columnKeys(header, index);
  }

  return createColumnKey(header, options.keyStyle);
}

function parseRow(
  line: string,
  columns: readonly TerminalTableColumn[],
  mode: DetectedParseMode,
  options: ResolvedOptions
): TerminalTableRow {
  if (mode === 'tokens') {
    return parseTokenRow(line, columns, options);
  }

  const row: TerminalTableRow = {};

  columns.forEach((column, index) => {
    const next = columns[index + 1];
    const end = next ? next.start : (options.preserveLastColumn ? undefined : column.end);
    const rawValue = line.slice(column.start, end);
    const value = !next && !options.preserveLastColumn && column.end === undefined
      ? rawValue.trim().split(/\s+/u)[0] ?? ''
      : rawValue;
    row[column.key] = options.trimCells ? value.trim() : value;
  });

  return row;
}

function parseTokenRow(
  line: string,
  columns: readonly TerminalTableColumn[],
  options: ResolvedOptions
): TerminalTableRow {
  const row: TerminalTableRow = {};
  const tokens = line.trim().split(/\s+/u);

  columns.forEach((column, index) => {
    if (index === columns.length - 1 && options.preserveLastColumn) {
      row[column.key] = tokens.slice(index).join(' ');
      return;
    }

    row[column.key] = tokens[index] ?? '';
  });

  return row;
}

function cloneGlobalRegex(regex: RegExp): RegExp {
  return new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : `${regex.flags}g`);
}
