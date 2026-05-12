export type ColumnKeyStyle = 'preserve' | 'camel' | 'snake';
export type ParseMode = 'auto' | 'fixed' | 'tokens';

export interface TerminalTableColumn {
  end?: number;
  header: string;
  key: string;
  start: number;
}

export type TerminalTableCellValue = string;
export type TerminalTableRow = Record<string, TerminalTableCellValue>;

export interface TerminalTableModel {
  columns: TerminalTableColumn[];
  mode: Exclude<ParseMode, 'auto'>;
  rows: TerminalTableRow[];
}

export interface ParseTerminalTableOptions {
  columnKeys?: readonly string[] | ((header: string, index: number) => string);
  headers?: readonly string[] | ((header: string, index: number) => string);
  headerLine?: number;
  keyStyle?: ColumnKeyStyle;
  maxRows?: number;
  mode?: ParseMode;
  preserveLastColumn?: boolean;
  separator?: RegExp;
  skipEmptyLines?: boolean;
  stripAnsi?: boolean;
  trimCells?: boolean;
}
