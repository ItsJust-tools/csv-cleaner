'use client';

import React from 'react';
import {
  cleanedCsv,
  computeCleanStats,
  deriveHeaders,
  effectiveDelimiter,
  guessCellType,
  coerceCell,
  parseTable,
} from '../helpers';
import { HEADER_NAMINGS } from '../ui-shared';
import { MAX_HISTORY, type ToolState } from '../types';

interface CanvasProps {
  state: ToolState;
  onChange?: (state: ToolState) => void;
  onSaveHistory?: (text: string) => void;
}

function CopyButton({ value, testid }: { value: string; testid?: string }) {
  const [copied, setCopied] = React.useState(false);
  const handleCopy = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable; ignore
    }
  }, [value]);
  return (
    <button
      type="button"
      onClick={handleCopy}
      data-testid={testid}
      className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800"
      aria-label="Copy value"
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

const TOGGLES: { key: keyof ToolState; label: string; testid: string }[] = [
  { key: 'hasHeader', label: 'First row is header', testid: 'toggle-has-header' },
  { key: 'trimWhitespace', label: 'Trim whitespace', testid: 'toggle-trim-whitespace' },
  {
    key: 'normalizeLineEndings',
    label: 'Normalize line endings',
    testid: 'toggle-normalize-newlines',
  },
  { key: 'removeEmptyRows', label: 'Remove empty rows', testid: 'toggle-remove-empty' },
  { key: 'removeDuplicates', label: 'Remove duplicate rows', testid: 'toggle-remove-duplicates' },
];

const QUOTING_OPTIONS: { value: ToolState['quoting']; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'minimal', label: 'Minimal' },
  { value: 'all', label: 'Quote all' },
  { value: 'none', label: 'No quotes' },
];

export const Canvas: React.FC<CanvasProps> = ({ state, onChange, onSaveHistory }) => {
  const update = (patch: Partial<ToolState>) => onChange?.({ ...state, ...patch });
  const table = parseTable(state);
  const headers = deriveHeaders(state, table);
  const stats = computeCleanStats(state);
  const output = cleanedCsv(state);
  const hasData = state.csv.trim() !== '';

  return (
    <div className="p-4 space-y-6 overflow-y-auto h-full" data-testid="csv-cleaner-canvas">
      <div>
        <label
          htmlFor="csv-input"
          className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400"
        >
          Paste or drop CSV
        </label>
        <textarea
          id="csv-input"
          value={state.csv}
          onChange={(e) => update({ csv: e.target.value })}
          data-testid="csv-input"
          rows={8}
          placeholder="name, age, city&#10;  Alice , 30, NYC&#10;Bob,25, LA"
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 font-mono text-xs text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
        />
        <div className="mt-3">
          <label
            htmlFor="csv-file"
            className="inline-block cursor-pointer rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            Upload CSV file
            <input
              id="csv-file"
              type="file"
              accept=".csv,.tsv,text/csv,text/plain"
              className="hidden"
              data-testid="csv-file-input"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => update({ csv: String(reader.result ?? '') });
                reader.readAsText(file);
              }}
            />
          </label>
        </div>
      </div>

      <div className="flex flex-wrap gap-4">
        {TOGGLES.map(({ key, label, testid }) => (
          <label
            key={key}
            className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300"
          >
            <input
              type="checkbox"
              checked={Boolean(state[key])}
              onChange={(e) => update({ [key]: e.target.checked } as Partial<ToolState>)}
              data-testid={testid}
              className="h-4 w-4"
            />
            {label}
          </label>
        ))}
      </div>

      {state.hasHeader ? (
        <div>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Columns
          </h3>
          <ul className="flex flex-wrap gap-2" data-testid="header-list">
            {headers.map((header: string, index: number) => {
              const original = table.headers[index] ?? '';
              const renamed = original !== header;
              return (
                <li
                  key={`${header}-${index}`}
                  className="flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs dark:border-gray-800"
                >
                  {renamed ? (
                    <span
                      className="text-gray-500 dark:text-gray-400"
                      data-testid={`header-original-${index}`}
                    >
                      {original === '' ? '(blank)' : original}
                    </span>
                  ) : null}
                  <input
                    value={header}
                    onChange={(e) => {
                      const nextRenames = state.headerRenames.filter(
                        (entry) => entry.index !== index
                      );
                      nextRenames.push({
                        index,
                        original,
                        name: e.target.value,
                      });
                      update({ headerRenames: nextRenames });
                    }}
                    data-testid={`header-input-${index}`}
                    className="w-28 rounded border border-gray-300 bg-white px-1.5 py-0.5 font-mono text-[11px] dark:border-gray-700 dark:bg-gray-800"
                    aria-label={`Column ${index + 1} name`}
                  />
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {state.removeDuplicates ? (
        <p className="text-xs text-gray-500 dark:text-gray-400" data-testid="dup-note">
          Duplicate rows are compared on full rows unless key columns are selected in the sidebar.
        </p>
      ) : null}

      <div>
        <label
          htmlFor="coerce-column"
          className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400"
        >
          Type coercion preview
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <input
            id="coerce-column"
            type="checkbox"
            checked={state.coerceEnabled}
            onChange={(e) => update({ coerceEnabled: e.target.checked })}
            data-testid="toggle-coerce"
            className="h-4 w-4"
          />
          <select
            value={state.coerceColumn}
            onChange={(e) => update({ coerceColumn: e.target.value })}
            data-testid="coerce-column-select"
            disabled={!state.coerceEnabled}
            className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs dark:border-gray-700 dark:bg-gray-800 disabled:opacity-50"
          >
            <option value="">No column</option>
            {headers.map((header: string, index: number) => (
              <option key={`${header}-${index}`} value={header}>
                {header}
              </option>
            ))}
          </select>
          {state.coerceEnabled && state.coerceColumn ? (
            <select
              value={state.booleanRender}
              onChange={(e) =>
                update({ booleanRender: e.target.value as ToolState['booleanRender'] })
              }
              data-testid="boolean-render-select"
              className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs dark:border-gray-700 dark:bg-gray-800"
            >
              <option value="trueFalse">true / false</option>
              <option value="yesNo">yes / no</option>
              <option value="oneZero">1 / 0</option>
            </select>
          ) : null}
        </div>
        {state.coerceEnabled && state.coerceColumn && table.rows.length > 0 ? (
          <div className="mt-2 overflow-x-auto" data-testid="coerce-preview">
            {(() => {
              const colIndex = table.headers.findIndex(
                (h, i) => (deriveHeaders(state, table)[i] ?? '') === state.coerceColumn
              );
              if (colIndex < 0) return null;
              return (
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="text-left text-gray-500 dark:text-gray-400">
                      <th className="px-2 py-1">Before</th>
                      <th className="px-2 py-1">After</th>
                      <th className="px-2 py-1">Detected</th>
                    </tr>
                  </thead>
                  <tbody>
                    {table.rows.slice(0, 20).map((row, i) => {
                      const before = row[colIndex] ?? '';
                      const kind = guessCellType(before);
                      const after = coerceCell(before, kind, state.booleanRender);
                      return (
                        <tr key={i} className="border-t border-gray-100 dark:border-gray-800">
                          <td className="px-2 py-1 font-mono" data-testid={`coerce-before-${i}`}>
                            {before}
                          </td>
                          <td className="px-2 py-1 font-mono" data-testid={`coerce-after-${i}`}>
                            {after === null ? '⚠' : after.value === '' ? '(empty)' : after.value}
                          </td>
                          <td className="px-2 py-1">
                            <span className="rounded-full bg-gray-100 px-2 py-0.5 dark:bg-gray-800">
                              {kind}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              );
            })()}
          </div>
        ) : (
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400" data-testid="coerce-empty">
            {state.coerceEnabled
              ? 'Pick a column to see a before/after type-coercion preview.'
              : 'Enable the preview to test number, date and boolean coercion.'}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          {
            label: 'Rows (in/out)',
            value: stats ? `${stats.cleanedRows}/${stats.originalRows}` : '—',
            testid: 'stat-rows',
          },
          { label: 'Columns', value: stats ? String(stats.columns) : '—', testid: 'stat-columns' },
          {
            label: 'Dups removed',
            value: stats ? String(stats.duplicatesRemoved) : '—',
            testid: 'stat-dups',
          },
          {
            label: 'Empty removed',
            value: stats ? String(stats.emptyRowsRemoved) : '—',
            testid: 'stat-empty',
          },
          {
            label: 'Cells trimmed',
            value: stats ? String(stats.cellsTrimmed) : '—',
            testid: 'stat-trimmed',
          },
        ].map(({ label, value, testid }) => (
          <div
            key={label}
            className="rounded-lg border border-gray-200 bg-white p-3 text-center dark:border-gray-800 dark:bg-gray-900"
          >
            <span className="block text-[10px] uppercase tracking-widest text-gray-500 dark:text-gray-400">
              {label}
            </span>
            <span className="block font-mono text-lg font-bold" data-testid={testid}>
              {value}
            </span>
          </div>
        ))}
      </div>

      <div
        className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900"
        data-testid="result-card"
      >
        <span className="mb-2 block text-[10px] uppercase tracking-widest text-gray-500 dark:text-gray-400">
          Cleaned CSV
        </span>
        {hasData ? (
          <>
            <pre
              className="max-h-72 overflow-auto whitespace-pre text-[11px] leading-relaxed"
              data-testid="csv-preview"
            >
              {output}
            </pre>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <CopyButton value={output} testid="copy-output" />
              <label htmlFor="download-link" className="hidden">
                hidden
              </label>
              <a
                id="download-link"
                data-testid="download-csv"
                className="rounded-md bg-violet-500 px-4 py-1.5 text-xs font-medium text-white hover:bg-violet-600"
                download={`${state.hasHeader ? 'cleaned' : 'data'}.csv`}
                href={`data:text/csv;charset=utf-8,${encodeURIComponent(output)}`}
              >
                Download CSV
              </a>
              {onSaveHistory ? (
                <button
                  type="button"
                  data-testid="btn-save-history"
                  onClick={() => onSaveHistory(output.slice(0, 120))}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  Save to history
                </button>
              ) : null}
            </div>
          </>
        ) : (
          <p className="text-xs text-gray-500 dark:text-gray-400" data-testid="result-empty">
            Paste or upload CSV data to see the cleaned result.
          </p>
        )}
      </div>

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900/50">
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
          Delimiter
        </h3>
        <p className="text-xs text-gray-700 dark:text-gray-300" data-testid="delimiter-detected">
          Detected delimiter:{' '}
          {effectiveDelimiter(state) === '\t' ? 'tab' : effectiveDelimiter(state)}
        </p>
        <h3 className="mb-2 mt-4 text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
          Header naming
        </h3>
        <select
          value={state.headerNaming}
          onChange={(e) => update({ headerNaming: e.target.value as ToolState['headerNaming'] })}
          data-testid="canvas-header-naming"
          className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs dark:border-gray-700 dark:bg-gray-800"
        >
          {HEADER_NAMINGS.map(
            (naming: { value: ToolState['headerNaming']; label: string; hint: string }) => (
              <option key={naming.value} value={naming.value}>
                {naming.label}
              </option>
            )
          )}
        </select>
        <h3 className="mb-2 mt-4 text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
          Quoting
        </h3>
        <select
          value={state.quoting}
          onChange={(e) => update({ quoting: e.target.value as ToolState['quoting'] })}
          data-testid="canvas-quoting"
          className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs dark:border-gray-700 dark:bg-gray-800"
        >
          {QUOTING_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
          History
        </h3>
        {state.history.length === 0 ? (
          <p className="text-xs text-gray-500 dark:text-gray-400" data-testid="history-empty">
            No saved cleanups yet.
          </p>
        ) : (
          <ul className="space-y-1" data-testid="history-list">
            {state.history.slice(0, MAX_HISTORY).map((entry, i) => (
              <li
                key={`${entry.createdAt}-${i}`}
                className="flex items-center justify-between gap-2 rounded-md border border-gray-200 px-3 py-1.5 text-xs dark:border-gray-800"
              >
                <span className="truncate text-gray-700 dark:text-gray-300">{entry.text}</span>
                <CopyButton value={entry.text} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-center text-xs text-gray-500 dark:text-gray-400">
        All cleaning runs locally in your browser; nothing is uploaded.
      </p>
    </div>
  );
};
