import { describe, it, expect } from 'vitest';
import {
  DEFAULT_STATE,
  MAX_HISTORY,
  detectDelimiter,
  effectiveDelimiter,
  parseCsv,
  parseCsvLine,
  parseTable,
  serializeCsv,
  serializeCsvLine,
  normalizeNewlines,
  toSnakeCase,
  normalizeHeaderName,
  deriveHeaders,
  removeDuplicateRows,
  removeEmptyRows,
  isEmptyRow,
  guessCellType,
  coerceCell,
  cleanedCsv,
  computeCleanStats,
  selectColumns,
  type ToolState,
} from '@/tool/types';
import {
  csvCleanerTool,
  deserializeState,
  serializeState,
  withHistory,
  roundTrips,
  summaryText,
} from '@/tool/tool-definition';
import { toolConfig } from '@/tool/tool.config';

const state = (patch: Partial<ToolState> = {}): ToolState => ({ ...DEFAULT_STATE, ...patch });

const SAMPLE = 'name, age , city\n"Smith, John",30,NYC\n  Alice  ,25,LA\n';

describe('tool config', () => {
  it('uses the csv-cleaner id', () => {
    expect(toolConfig.id).toBe('csv-cleaner');
    expect(csvCleanerTool.id).toBe('csv-cleaner');
    expect(csvCleanerTool.name).toBe(toolConfig.name);
  });
});

describe('normalizeNewlines', () => {
  it('converts CRLF and CR to LF', () => {
    expect(normalizeNewlines('a\r\nb\rc\nd')).toBe('a\nb\nc\nd');
  });
});

describe('parseCsvLine', () => {
  it('splits unquoted fields', () => {
    expect(parseCsvLine('a,b,c', ',')).toEqual(['a', 'b', 'c']);
  });

  it('keeps delimiter inside quotes', () => {
    expect(parseCsvLine('"Smith, John",30', ',')).toEqual(['Smith, John', '30']);
  });

  it('unescapes doubled quotes and preserves embedded newlines', () => {
    expect(parseCsvLine('"say ""hi""","line\nbreak"', ',')).toEqual(['say "hi"', 'line\nbreak']);
  });

  it('supports tab delimiter', () => {
    expect(parseCsvLine('a\tb\tc', '\t')).toEqual(['a', 'b', 'c']);
  });
});

describe('detectDelimiter', () => {
  it('detects comma', () => {
    expect(detectDelimiter('a,b\n1,2\n3,4')).toBe(',');
  });

  it('detects semicolon', () => {
    expect(detectDelimiter('a;b;c\n1;2;3\n4;5;6')).toBe(';');
  });

  it('detects tab', () => {
    expect(detectDelimiter('a\tb\n1\t2\n3\t4')).toBe('\t');
  });

  it('detects pipe', () => {
    expect(detectDelimiter('a|b\n1|2\n3|4')).toBe('|');
  });

  it('falls back to comma for single-column data', () => {
    expect(detectDelimiter('a\nb\nc')).toBe(',');
  });

  it('prefers consistent counts over max counts', () => {
    // comma yields inconsistent counts, semicolon is consistent
    const input = 'a;"x,y"\n1;"2,3"';
    expect(detectDelimiter(input)).toBe(';');
  });
});

describe('effectiveDelimiter', () => {
  it('uses manual override when valid', () => {
    expect(effectiveDelimiter(state({ delimiter: ';' }), 'a,b')).toBe(';');
  });

  it('falls back to detection', () => {
    expect(effectiveDelimiter(state(), 'a;b\n1;2')).toBe(';');
  });

  it('coerces invalid override to comma', () => {
    expect(effectiveDelimiter(state({ delimiter: ':' }), 'a,b')).toBe(',');
  });
});

describe('parseTable', () => {
  it('separates header and data rows', () => {
    const table = parseTable(state(), SAMPLE);
    expect(table.headers).toEqual(['name', 'age', 'city']);
    expect(table.rows).toHaveLength(2);
  });

  it('trims whitespace in cells when enabled', () => {
    const table = parseTable(state(), SAMPLE);
    expect(table.rows[1]).toEqual(['Alice', '25', 'LA']);
  });

  it('keeps whitespace when trimming disabled', () => {
    const table = parseTable(state({ trimWhitespace: false }), 'a, b\n1, 2\n');
    expect(table.rows[0]).toEqual(['1', ' 2']);
  });

  it('generates synthetic headers when hasHeader=false', () => {
    const table = parseTable(state({ hasHeader: false }), 'a,b\n1,2');
    expect(table.headers).toEqual(['column_1', 'column_2']);
    expect(table.rows).toHaveLength(2);
  });

  it('returns empty table for empty input', () => {
    const table = parseTable(state(), '   \n  ');
    expect(table.headers).toEqual([]);
    expect(table.rows).toEqual([]);
  });
});

describe('header normalization', () => {
  it('applies lowercase naming', () => {
    expect(normalizeHeaderName('First Name', 'lowercase')).toBe('first name');
  });

  it('applies snake_case naming including camelCase', () => {
    expect(toSnakeCase('First Name')).toBe('first_name');
    expect(toSnakeCase('  userID Value ')).toBe('user_id_value');
    expect(toSnakeCase('createdAt')).toBe('created_at');
    expect(normalizeHeaderName('Order ID', 'snake_case')).toBe('order_id');
  });

  it('keeps original naming but trims', () => {
    expect(normalizeHeaderName('  Age  ', 'original')).toBe('Age');
  });

  it('dedupes conflicting header names with _2, _3 suffixes', () => {
    const table = { headers: ['id', 'id', 'id'], rows: [], delimiter: ',' as const };
    const s = state();
    expect(deriveHeaders(s, table)).toEqual(['id', 'id_2', 'id_3']);
  });

  it('dedupes names that collide after normalization', () => {
    const table = { headers: ['Name', 'name'], rows: [], delimiter: ',' as const };
    const s = state({ headerNaming: 'lowercase' });
    expect(deriveHeaders(s, table)).toEqual(['name', 'name_2']);
  });

  it('applies manual renames and still dedupes', () => {
    const table = { headers: ['a', 'b'], rows: [], delimiter: ',' as const };
    const s = state({
      headerRenames: [
        { index: 0, original: 'a', name: 'same' },
        { index: 1, original: 'b', name: 'same' },
      ],
    });
    expect(deriveHeaders(s, table)).toEqual(['same', 'same_2']);
  });

  it('names blank headers as column', () => {
    const table = { headers: ['', ''], rows: [], delimiter: ',' as const };
    expect(deriveHeaders(state(), table)).toEqual(['column', 'column_2']);
  });
});

describe('empty and duplicate rows', () => {
  it('detects whitespace-only rows as empty', () => {
    expect(isEmptyRow(['', '   '])).toBe(true);
    expect(isEmptyRow(['a', ''])).toBe(false);
    expect(isRowEmptyHelper([' ', '\t'])).toBe(true);
  });

  it('removeEmptyRows drops empty and whitespace-only rows', () => {
    const rows = [
      ['a', 'b'],
      [' ', ''],
      ['c', 'd'],
      ['', ''],
    ];
    expect(removeEmptyRows(rows)).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('removeDuplicateRows keeps first occurrence (full row)', () => {
    const rows = [
      ['a', '1'],
      ['b', '2'],
      ['a', '1'],
    ];
    expect(removeDuplicateRows(rows)).toEqual([
      ['a', '1'],
      ['b', '2'],
    ]);
  });

  it('removeDuplicateRows with key columns compares only those', () => {
    const rows = [
      ['a', '1'],
      ['a', '2'],
      ['b', '2'],
    ];
    expect(removeDuplicateRows(rows, [0])).toEqual([
      ['a', '1'],
      ['b', '2'],
    ]);
    expect(removeDuplicateRows(rows, [1])).toEqual([
      ['a', '1'],
      ['a', '2'],
    ]);
  });

  it('handles rows shorter than key columns', () => {
    const rows = [['a'], ['a', 'x']];
    expect(removeDuplicateRows(rows, [0, 1])).toEqual([['a'], ['a', 'x']]);
  });
});

function isRowEmptyHelper(cells: string[]): boolean {
  return removeEmptyRows([cells]).length === 0;
}

describe('type coercion', () => {
  it('guesses numbers, dates, booleans and strings', () => {
    expect(guessCellType('42')).toBe('number');
    expect(guessCellType('-3.5e2')).toBe('number');
    expect(guessCellType('2024-01-15')).toBe('date');
    expect(guessCellType('12/31/2024')).toBe('date');
    expect(guessCellType('true')).toBe('boolean');
    expect(guessCellType('YES')).toBe('boolean');
    expect(guessCellType('0')).toBe('boolean');
    expect(guessCellType('hello')).toBe('string');
    expect(guessCellType('')).toBe('string');
  });

  it('coerces booleans with all render modes', () => {
    expect(coerceCell('true', 'boolean', 'trueFalse')?.value).toBe('true');
    expect(coerceCell('no', 'boolean', 'yesNo')?.value).toBe('no');
    expect(coerceCell('yes', 'boolean', 'oneZero')?.value).toBe('1');
    expect(coerceCell('0', 'boolean', 'oneZero')?.value).toBe('0');
  });

  it('formats numbers without float noise', () => {
    expect(coerceCell(' 3.0 ', 'number', 'trueFalse')?.value).toBe('3');
    expect(coerceCell('2.50', 'number', 'trueFalse')?.value).toBe('2.5');
  });

  it('returns null for failed coercion', () => {
    expect(coerceCell('abc', 'number', 'trueFalse')).toBeNull();
    expect(coerceCell('maybe', 'boolean', 'trueFalse')).toBeNull();
    expect(coerceCell('99/x/99', 'date', 'trueFalse')).toBeNull();
  });

  it('preserves ISO dates without timezone drift', () => {
    const result = coerceCell('2024-01-15', 'date', 'trueFalse');
    expect(result?.value).toContain('2024-01-15');
  });

  it('converts slash dates to long form', () => {
    expect(coerceCell('1/5/2024', 'date', 'trueFalse')?.value).toBe('jan 5, 2024');
    expect(coerceCell('12/31/99', 'date', 'trueFalse')?.value).toBe('dec 31, 1999');
  });
});

describe('column selection', () => {
  it('keeps all columns in order when selection empty', () => {
    expect(selectColumns([['a', 'b', 'c']], [], 3)).toEqual([['a', 'b', 'c']]);
  });

  it('selects and reorders columns', () => {
    expect(selectColumns([['a', 'b', 'c']], [2, 0], 3)).toEqual([['c', 'a']]);
  });

  it('pads short rows', () => {
    expect(selectColumns([['a']], [], 3)).toEqual([['a', '', '']]);
  });
});

describe('serialization', () => {
  it('quotes only when required in auto mode', () => {
    expect(serializeCsvLine(['a', 'b'], ',', 'auto')).toBe('a,b');
    expect(serializeCsvLine(['a,b', 'c'], ',', 'auto')).toBe('"a,b",c');
    expect(serializeCsvLine([' say "hi" ', 'x'], ',', 'auto')).toBe('" say ""hi"" ",x');
  });

  it('supports minimal, all and none quoting', () => {
    expect(serializeCsvLine(['a', 'b'], ',', 'minimal')).toBe('a,b');
    expect(serializeCsvLine(['a', 'b'], ',', 'all')).toBe('"a","b"');
    expect(serializeCsvLine(['a,b', 'b'], ',', 'none')).toBe('a,b,b');
  });

  it('omits header when includeHeader=false', () => {
    const out = serializeCsv(['h1', 'h2'], [['a', 'b']], ',', {
      includeHeader: false,
      quoting: 'auto',
    });
    expect(out).toBe('a,b');
  });

  it('tab delimiter output round-trips through parseCsv', () => {
    const out = serializeCsv(['a', 'b'], [['1', '2']], '\t', {
      includeHeader: true,
      quoting: 'auto',
    });
    expect(parseCsv(state({ delimiter: '\t' }), out)).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
});

describe('cleanedCsv', () => {
  it('trims, normalizes headers and removes empty rows', () => {
    const input = 'Name, Age\n Alice ,30\n\n Bob , \n';
    const s = state({ csv: input, headerNaming: 'snake_case' });
    expect(cleanedCsv(s)).toBe('name,age\nAlice,30\nBob,');
  });

  it('removes duplicates', () => {
    const input = 'id,name\n1,a\n1,a\n2,b\n';
    const s = state({ csv: input, removeDuplicates: true });
    expect(cleanedCsv(s)).toBe('id,name\n1,a\n2,b');
  });

  it('removes duplicates by key column', () => {
    const input = 'id,name\n1,a\n1,x\n2,b\n';
    const s = state({ csv: input, removeDuplicates: true, duplicateKeyColumns: [0] });
    expect(cleanedCsv(s)).toBe('id,name\n1,a\n2,b');
  });

  it('honors includeHeader=false and delimiter override', () => {
    const input = 'a;b\n1;2\n';
    const s = state({ csv: input, delimiter: ';', includeHeader: false });
    expect(cleanedCsv(s)).toBe('1;2');
  });

  it('coerces the selected column when enabled', () => {
    const input = 'flag\ntrue\nno\n';
    const s = state({
      csv: input,
      coerceEnabled: true,
      coerceColumn: 'flag',
      booleanRender: 'oneZero',
    });
    expect(cleanedCsv(s)).toBe('flag\n1\n0');
  });

  it('applies selected column order', () => {
    const input = 'a,b,c\n1,2,3\n';
    const s = state({ csv: input, selectedColumns: [2, 0] });
    expect(cleanedCsv(s)).toBe('c,a\n3,1');
  });
});

describe('computeCleanStats', () => {
  it('returns null with no data', () => {
    expect(computeCleanStats(state())).toBeNull();
  });

  it('counts removals and trims', () => {
    const input = 'a,b\n x ,y\n\n x ,y\n';
    const s = state({ csv: input, removeDuplicates: true });
    const stats = computeCleanStats(s);
    expect(stats).toEqual({
      originalRows: 3,
      cleanedRows: 1,
      columns: 2,
      emptyRowsRemoved: 1,
      duplicatesRemoved: 1,
      cellsTrimmed: 2,
    });
  });
});

describe('serialize / deserialize round-trip', () => {
  it('round-trips a full state', () => {
    const s = state({
      csv: SAMPLE,
      removeDuplicates: true,
      duplicateKeyColumns: [1],
      headerNaming: 'snake_case',
      headerRenames: [{ index: 0, original: 'name', name: 'full_name' }],
      selectedColumns: [1, 0],
      coerceEnabled: true,
      coerceColumn: 'age',
      booleanRender: 'yesNo',
      quoting: 'all',
      history: [{ text: 'done', createdAt: '2026-11-22T10:00:00.000Z' }],
    });
    expect(roundTrips(s)).toBe(true);
    const restored = deserializeState(JSON.parse(serializeState(s)));
    expect(restored.success).toBe(true);
    if (restored.success) {
      expect(restored.data).toEqual(s);
    }
  });

  it('repairs invalid payloads to defaults', () => {
    const result = deserializeState({
      csv: 42,
      hasHeader: 'no',
      delimiter: null,
      headerNaming: 'weird',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(DEFAULT_STATE);
    }
  });

  it('rejects non-object payloads', () => {
    expect(deserializeState('nope').success).toBe(false);
    expect(deserializeState(null).success).toBe(false);
    expect(deserializeState([1]).success).toBe(false);
  });

  it('dedupes and caps duplicate-key columns on import', () => {
    const result = deserializeState({
      duplicateKeyColumns: [0, 'x', -2, 1.5],
      selectedColumns: [2, 0],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.duplicateKeyColumns).toEqual([0]);
      expect(result.data.selectedColumns).toEqual([2, 0]);
    }
  });

  it('caps history at MAX_HISTORY in order', () => {
    let s = state();
    for (let i = 0; i < MAX_HISTORY + 5; i++) {
      s = withHistory(s, `entry-${i}`, new Date(2026, 0, 1, 0, 0, i));
    }
    expect(s.history.length).toBe(MAX_HISTORY);
    expect(s.history[0]?.text).toBe(`entry-${MAX_HISTORY + 4}`);
  });

  it('exposes the tool contract', () => {
    expect(csvCleanerTool.initialState).toEqual(DEFAULT_STATE);
    expect(csvCleanerTool.serialize(DEFAULT_STATE)).toContain('"csv":""');
    const exporters = csvCleanerTool.exporters ?? [];
    expect(exporters).toHaveLength(4);
  });
});

describe('summaryText', () => {
  it('describes empty state', () => {
    expect(summaryText(state())).toContain('paste or upload');
  });

  it('summarizes stats with data', () => {
    const s = state({ csv: SAMPLE });
    expect(summaryText(s)).toContain('Rows 2/2');
    expect(summaryText(s)).toContain('Columns 3');
  });
});
