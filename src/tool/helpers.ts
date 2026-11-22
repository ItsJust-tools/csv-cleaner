export {
  detectDelimiter,
  effectiveDelimiter,
  parseCsv,
  parseCsvLine,
  parseTable,
  serializeCsv,
  serializeCsvLine,
  normalizeNewlines,
  cleanedCsv,
  computeCleanStats,
  deriveHeaders,
  normalizeHeaderName,
  toSnakeCase,
  removeDuplicateRows,
  removeEmptyRows,
  isEmptyRow,
  coerceCell,
  guessCellType,
  selectColumns,
} from './types';
export type { Delimiter, ParsedTable, Quoting } from './types';
export { HEADER_NAMINGS, isState } from './ui-shared';

export function emptyRow<T>(value: T): T {
  return value;
}
