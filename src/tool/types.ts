export type Delimiter = ',' | ';' | '\t' | '|';

export type BooleanRenderMode = 'trueFalse' | 'yesNo' | 'oneZero';

export type Quoting = 'auto' | 'all' | 'minimal' | 'none';

export interface HeaderRename {
  index: number;
  original: string;
  name: string;
}

export type HeaderNaming = 'original' | 'lowercase' | 'snake_case';

export interface ToolState {
  /** Raw pasted/uploaded CSV text, or '' when none. */
  csv: string;
  /** Manually selected delimiter; '' = auto-detect. */
  delimiter: string;
  /** Whether the first data row is the header row. */
  hasHeader: boolean;
  /** Trim whitespace in every cell. */
  trimWhitespace: boolean;
  /** Normalize line endings to \n before parsing. */
  normalizeLineEndings: boolean;
  /** Remove rows that are empty or whitespace-only. */
  removeEmptyRows: boolean;
  /** Remove duplicate rows (by full row or by key columns). */
  removeDuplicates: boolean;
  /** Optional key columns for duplicate removal. */
  duplicateKeyColumns: number[];
  /** Header naming: original, lowercase, or snake_case. */
  headerNaming: HeaderNaming;
  /** Manual header rename overrides, newest wins per index. */
  headerRenames: HeaderRename[];
  /** Type coercion demo for a selected column ('' = none). */
  coerceColumn: string;
  /** Render booleans as true/false, yes/no or 1/0. */
  booleanRender: BooleanRenderMode;
  /** Whether coercion preview is enabled. */
  coerceEnabled: boolean;
  /** Selected keep columns in display order; empty = all original order. */
  selectedColumns: number[];
  /** Manual column widths for layout tweaks. */
  columnWidths: number[];
  /** CSV quoting mode. */
  quoting: Quoting;
  /** Include a header row in output. */
  includeHeader: boolean;
  /** Whether a header row should be copied to the clipboard with the CSV. */
  copyHeader: boolean;
  /** Saved result history, newest first. */
  history: HistoryEntry[];
}

export interface HistoryEntry {
  /** Short human readable description of the cleaned result. */
  text: string;
  /** ISO timestamp when the entry was saved. */
  createdAt: string;
}

export const DEFAULT_STATE: ToolState = {
  csv: '',
  delimiter: '',
  hasHeader: true,
  trimWhitespace: true,
  normalizeLineEndings: true,
  removeEmptyRows: true,
  removeDuplicates: false,
  duplicateKeyColumns: [],
  headerNaming: 'original',
  headerRenames: [],
  coerceColumn: '',
  booleanRender: 'trueFalse',
  coerceEnabled: false,
  selectedColumns: [],
  columnWidths: [],
  quoting: 'auto',
  includeHeader: true,
  copyHeader: true,
  history: [],
};

export const MAX_HISTORY = 20;

const DELIMITER_CANDIDATES: Delimiter[] = [',', ';', '\t', '|'];

/** Normalize line endings CRLF/CR to LF. */
export function normalizeNewlines(input: string): string {
  return input.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/** Trim whitespace in each cell of a parsed row. */
export function trimCells(cells: string[]): string[] {
  return cells.map((cell) => cell.trim());
}

/** True when every cell is empty or whitespace-only. */
export function isEmptyRow(cells: string[]): boolean {
  return cells.every((cell) => cell.trim() === '');
}

/** Parse one CSV line using RFC 4180-style quoted fields. */
export function parseCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      cells.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}

/** Serialize one row to a CSV line, quoting when needed. */
export function serializeCsvLine(cells: string[], delimiter: string, quoting: Quoting): string {
  const needsQuotes = (cell: string): boolean => {
    if (quoting === 'all') return true;
    if (quoting === 'none') return false;
    if (quoting === 'minimal') {
      return cell.includes(delimiter) || cell.includes('"') || /[\r\n]/.test(cell);
    }
    return (
      cell.includes(delimiter) || cell.includes('"') || /[\r\n]/.test(cell) || cell.trim() !== cell
    );
  };
  return cells
    .map((cell) => (needsQuotes(cell) ? `"${cell.replace(/"/g, '""')}"` : cell))
    .join(delimiter);
}

/** Guess the delimiter with the most consistent column count across rows. */
export function detectDelimiter(input: string): Delimiter {
  const sample = normalizeNewlines(input)
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .slice(0, 10);
  let best: Delimiter = ',';
  let bestScore = 0;
  for (const delimiter of DELIMITER_CANDIDATES) {
    const counts = sample.map((line) => parseCsvLine(line, delimiter).length);
    if (counts.some((count) => count < 2)) continue;
    const first = counts[0] ?? 0;
    const consistent = counts.every((count) => count === first) ? first : 0;
    if (consistent > bestScore) {
      bestScore = consistent;
      best = delimiter;
    }
  }
  return best;
}

/** Resolve the effective delimiter from state.autoDelimiter + state.delimiter. */
export function effectiveDelimiter(state: ToolState, input = state.csv): Delimiter {
  if (state.delimiter === '') return detectDelimiter(input);
  return (DELIMITER_CANDIDATES as string[]).includes(state.delimiter)
    ? (state.delimiter as Delimiter)
    : ',';
}

/** Parse raw CSV text into rows of cells. */
export function parseCsv(state: ToolState, raw = state.csv): string[][] {
  if (!raw.trim()) return [];
  const delimiter = effectiveDelimiter(state, raw);
  const text = state.normalizeLineEndings ? normalizeNewlines(raw) : raw;
  return text
    .split(/\r?\n|\r/)
    .filter((line, index, all) => !(index === all.length - 1 && line === ''))
    .map((line) => parseCsvLine(line, delimiter))
    .map((cells) => (state.trimWhitespace ? trimCells(cells) : cells));
}

export interface ParsedTable {
  headers: string[];
  rows: string[][];
  delimiter: Delimiter;
}

/** Parse raw CSV into headers + rows honoring hasHeader. */
export function parseTable(state: ToolState, raw = state.csv): ParsedTable {
  const rows = parseCsv(state, raw);
  const delimiter = effectiveDelimiter(state, raw);
  if (rows.length === 0) return { headers: [], rows: [], delimiter };
  if (state.hasHeader) {
    const [header, ...rest] = rows;
    return {
      headers: header ?? [],
      rows: rest,
      delimiter,
    };
  }
  const width = Math.max(...rows.map((row) => row.length));
  return {
    headers: Array.from({ length: width }, (_, i) => `column_${i + 1}`),
    rows,
    delimiter,
  };
}

const SNAKE_BOUNDARY = /[\s\-_]+/;

/** Convert a header cell to snake_case. */
export function toSnakeCase(name: string): string {
  return name
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .split(SNAKE_BOUNDARY)
    .filter((part) => part.length > 0)
    .map((part) => part.toLowerCase())
    .join('_');
}

/** Apply the header naming policy to a raw header name. */
export function normalizeHeaderName(name: string, naming: HeaderNaming): string {
  if (naming === 'lowercase') return name.trim().toLowerCase();
  if (naming === 'snake_case') return toSnakeCase(name);
  return name.trim();
}

/**
 * Derive the output column names: header naming policy + manual renames,
 * deduped by appending _2, _3, ...
 */
export function deriveHeaders(state: ToolState, table: ParsedTable = parseTable(state)): string[] {
  const headers = table.headers.map((name, index) => {
    const rename = state.headerRenames.find((entry) => entry.index === index);
    if (rename !== undefined && rename.name.trim() !== '') return rename.name.trim();
    return normalizeHeaderName(name, state.headerNaming);
  });
  const seen = new Map<string, number>();
  return headers.map((raw) => {
    const name = raw === '' ? 'column' : raw;
    let candidate = name;
    const count = seen.get(candidate) ?? 0;
    seen.set(candidate, count + 1);
    if (count > 0) {
      let suffix = 2;
      candidate = `${name}_${suffix}`;
      while (seen.has(candidate)) {
        suffix++;
        candidate = `${name}_${suffix}`;
      }
      seen.set(candidate, (seen.get(candidate) ?? 0) + 1);
    }
    return candidate;
  });
}

/** True when a raw cell is empty or whitespace-only. */
export function isBlankCell(cell: string): boolean {
  return cell.trim() === '';
}

/** True when a row is entirely empty cells (after trimming). */
export function isRowEmpty(cells: string[]): boolean {
  return isEmptyRow(cells);
}

/** Remove empty (or whitespace-only) rows. */
export function removeEmptyRows(rows: string[][]): string[][] {
  return rows.filter((row) => !isRowEmpty(row));
}

/** Remove duplicate rows, optionally keyed by selected column indexes. */
export function removeDuplicateRows(rows: string[][], keyColumns: number[] = []): string[][] {
  if (keyColumns.length > 0) {
    const seen = new Set<string>();
    return rows.filter((row) => {
      const key = keyColumns.map((index) => row[index] ?? '').join('\u0000');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = JSON.stringify(row);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export type CoerceKind = 'number' | 'date' | 'boolean' | 'string';

export interface CoerceResult {
  kind: CoerceKind;
  value: string;
  warning?: string;
}

const TRUE_WORDS = new Set(['true', 'yes', 'y', '1']);
const FALSE_WORDS = new Set(['false', 'no', 'n', '0']);

/** Guess the type of one cell value. */
export function guessCellType(cell: string): CoerceKind {
  const trimmed = cell.trim();
  if (trimmed === '') return 'string';
  if (TRUE_WORDS.has(trimmed.toLowerCase()) || FALSE_WORDS.has(trimmed.toLowerCase())) {
    return 'boolean';
  }
  if (/^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(trimmed)) return 'number';
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return 'date';
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(trimmed)) return 'date';
  return 'string';
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/**
 * ISO 8601 date strings must keep their local UTC date, not shift by a
 * timezone, so parse the components directly instead of `new Date(value)`.
 */
function parseIsoDate(value: string): number | null {
  const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = match[3] ? Number(match[3]) : 1;
  const date = new Date(year, monthIndex, day);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
}

/**
 * Convert one cell for the coercion preview. Returns null when the coercion
 * fails (e.g. malformed date input); the caller renders the original value.
 */
export function coerceCell(
  cell: string,
  kind: CoerceKind,
  booleanRender: BooleanRenderMode
): CoerceResult | null {
  const trimmed = cell.trim();
  if (trimmed === '') return { kind, value: '' };
  if (kind === 'number') {
    if (!/^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(trimmed)) return null;
    const value = Number(trimmed);
    if (!Number.isFinite(value)) return null;
    return {
      kind,
      value: String(value),
      warning: value.toString() === trimmed ? undefined : 'Number formatted',
    };
  }
  if (kind === 'boolean') {
    const lower = trimmed.toLowerCase();
    if (TRUE_WORDS.has(lower)) {
      return {
        kind,
        value: booleanRender === 'oneZero' ? '1' : booleanRender === 'yesNo' ? 'yes' : 'true',
      };
    }
    if (FALSE_WORDS.has(lower)) {
      return {
        kind,
        value: booleanRender === 'oneZero' ? '0' : booleanRender === 'yesNo' ? 'no' : 'false',
      };
    }
    return null;
  }
  if (kind === 'date') {
    if (/^\d{4}-\d{2}(?:-\d{2})?$/.test(trimmed)) {
      const time = parseIsoDate(trimmed);
      if (time === null) return null;
      return { kind, value: trimmed.replace(/-0?$/, ''), warning: 'ISO date preserved' };
    }
    if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(trimmed)) {
      const parts = trimmed.split('/');
      const first = Number(parts[0]);
      const second = Number(parts[1]);
      const yearPart = parts[2] ?? '';
      let year = Number(yearPart);
      if (yearPart.length === 2) year = year < 50 ? 2000 + year : 1900 + year;
      const monthIndex = first >= 1 && first <= 12 ? first - 1 : null;
      const day = second;
      if (monthIndex === null || day < 1 || day > 31) return null;
      const date = new Date(year, monthIndex, day);
      if (Number.isNaN(date.getTime())) return null;
      const month = MONTHS[date.getMonth()];
      return { kind, value: `${month} ${date.getDate()}, ${year}` };
    }
    return null;
  }
  return { kind, value: cell };
}

/** Coerce a full rows array for one column index, returning the converted rows. */
export function coerceColumn(
  rows: string[][],
  columnIndex: number,
  booleanRender: BooleanRenderMode
): string[][] {
  const guessed = guessCellType(rows[0]?.[columnIndex] ?? '');
  return rows.map((row) => {
    const cell = row[columnIndex] ?? '';
    const result = coerceCell(cell, guessed, booleanRender);
    if (result === null) return row;
    const copy = [...row];
    copy[columnIndex] = result.value;
    return copy;
  });
}

/** Pick keep columns in selection order; [0,2] keeps those, in that order. */
export function selectColumns(
  rows: string[][],
  selectedColumns: number[],
  width: number
): string[][] {
  if (selectedColumns.length === 0) {
    return rows.map((row) => Array.from({ length: width }, (_, index) => row[index] ?? ''));
  }
  return rows.map((row) => selectedColumns.map((index) => row[index] ?? ''));
}

/** Serialize clean rows into a CSV string honoring header/quoting settings. */
export function serializeCsv(
  headers: string[],
  rows: string[][],
  delimiter: Delimiter,
  options: { includeHeader: boolean; quoting: Quoting }
): string {
  const parts: string[] = [];
  if (options.includeHeader && headers.length > 0) {
    parts.push(serializeCsvLine(headers, delimiter, options.quoting));
  }
  for (const row of rows) parts.push(serializeCsvLine(row, delimiter, options.quoting));
  return parts.join('\n');
}

export interface CleanStats {
  originalRows: number;
  cleanedRows: number;
  columns: number;
  emptyRowsRemoved: number;
  duplicatesRemoved: number;
  cellsTrimmed: number;
}

/** Human-readable copy-ready summary of the cleaning result. */
export function summaryText(state: ToolState): string {
  const stats = computeCleanStats(state);
  if (stats === null) return 'CSV Cleaner: paste or upload CSV data to clean it.';
  return (
    `Rows ${stats.cleanedRows}/${stats.originalRows} · ` +
    `Columns ${stats.columns} · Dups removed ${stats.duplicatesRemoved} · ` +
    `Empty removed ${stats.emptyRowsRemoved}`
  );
}

/** Compute before/after cleaning statistics, or null with no input. */
export function computeCleanStats(state: ToolState): CleanStats | null {
  const { headers, rows, delimiter } = parseTable(state);
  if (rows.length === 0 && headers.length === 0) return null;
  const originalRows = rows.length;
  const untrimmed = parseTable({ ...state, trimWhitespace: false });
  const cellsTrimmed = state.trimWhitespace
    ? untrimmed.rows.reduce(
        (count, row) => count + row.filter((cell) => cell !== cell.trim()).length,
        0
      )
    : 0;
  let working = rows;
  let emptyRowsRemoved = 0;
  if (state.removeEmptyRows) {
    const filtered = removeEmptyRows(working);
    emptyRowsRemoved = working.length - filtered.length;
    working = filtered;
  }
  let duplicatesRemoved = 0;
  if (state.removeDuplicates) {
    const filtered = removeDuplicateRows(working, state.duplicateKeyColumns);
    duplicatesRemoved = working.length - filtered.length;
    working = filtered;
  }
  const projected = selectColumns(
    working,
    state.selectedColumns,
    headers.length || delimiter.length
  );
  void projected;
  const columns = state.selectedColumns.length > 0 ? state.selectedColumns.length : headers.length;
  return {
    originalRows,
    cleanedRows: working.length,
    columns,
    emptyRowsRemoved,
    duplicatesRemoved,
    cellsTrimmed,
  };
}

/** Build the cleaned CSV output for state. */
export function cleanedCsv(state: ToolState): string {
  const { headers, rows, delimiter } = parseTable(state);
  let working = rows;
  if (state.removeEmptyRows) working = removeEmptyRows(working);
  if (state.removeDuplicates) working = removeDuplicateRows(working, state.duplicateKeyColumns);
  const finalHeaders = deriveHeaders(state, { headers, rows, delimiter });
  const selected =
    state.selectedColumns.length > 0
      ? state.selectedColumns
      : finalHeaders.map((_, index) => index);
  const cleanHeaders = selected.map((index) => finalHeaders[index] ?? `column_${index + 1}`);
  if (state.coerceEnabled && state.coerceColumn.trim() !== '') {
    const index = finalHeaders.indexOf(state.coerceColumn.trim());
    if (index >= 0) working = coerceColumn(working, index, state.booleanRender);
  }
  const trimmedRows = selectColumns(working, selected, finalHeaders.length);
  return serializeCsv(cleanHeaders, trimmedRows, delimiter, {
    includeHeader: state.includeHeader,
    quoting: state.quoting,
  });
}

export function isState(value: unknown): value is ToolState {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Partial<ToolState>;
  return typeof v.csv === 'string' && typeof v.hasHeader === 'boolean';
}
