'use client';

import React from 'react';
import { computeCleanStats, deriveHeaders, effectiveDelimiter, parseTable } from '../helpers';
import { HEADER_NAMINGS } from '../ui-shared';
import type { ToolState } from '../types';

interface SidebarProps {
  state: ToolState;
  onChange: (next: ToolState) => void;
}

const DELIMITER_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Auto' },
  { value: ',', label: 'Comma ,' },
  { value: ';', label: 'Semicolon ;' },
  { value: '\t', label: 'Tab' },
  { value: '|', label: 'Pipe |' },
];

const TOGGLE_LABELS: { key: keyof ToolState; label: string }[] = [
  { key: 'trimWhitespace', label: 'Trim whitespace in cells' },
  { key: 'normalizeLineEndings', label: 'Normalize line endings' },
  { key: 'removeEmptyRows', label: 'Remove empty rows' },
  { key: 'removeDuplicates', label: 'Remove duplicate rows' },
  { key: 'includeHeader', label: 'Include header in output' },
];

export const Sidebar: React.FC<SidebarProps> = ({ state, onChange }) => {
  const update = (patch: Partial<ToolState>) => onChange({ ...state, ...patch });
  const stats = computeCleanStats(state);
  const table = parseTable(state);
  const delimiter = effectiveDelimiter(state);
  const headers = deriveHeaders(state, table);

  const toggle = (key: keyof ToolState, checked: boolean) =>
    update({ [key]: checked } as Partial<ToolState>);

  return (
    <div className="p-4 space-y-6 text-sm overflow-y-auto h-full" data-testid="csv-cleaner-sidebar">
      <div>
        <h3 className="mb-2 font-medium text-gray-900 dark:text-gray-100">Delimiter</h3>
        <select
          value={state.delimiter}
          onChange={(e) => update({ delimiter: e.target.value })}
          data-testid="sidebar-delimiter"
          className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs dark:border-gray-700 dark:bg-gray-800"
        >
          {DELIMITER_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <p
          className="mt-1 text-xs text-gray-500 dark:text-gray-400"
          data-testid="sidebar-detected-delimiter"
        >
          Detected: {delimiter === '\t' ? 'tab' : delimiter}
        </p>
      </div>
      <div>
        <h3 className="mb-2 font-medium text-gray-900 dark:text-gray-100">Cleaning options</h3>
        <ul className="space-y-2">
          {TOGGLE_LABELS.map(({ key, label }) => (
            <li key={key} className="flex items-center gap-2">
              <input
                id={`toggle-${key}`}
                type="checkbox"
                checked={Boolean(state[key])}
                onChange={(e) => toggle(key, e.target.checked)}
                data-testid={`sidebar-toggle-${key}`}
                className="h-4 w-4"
              />
              <label htmlFor={`toggle-${key}`} className="text-xs text-gray-700 dark:text-gray-300">
                {label}
              </label>
            </li>
          ))}
        </ul>
      </div>
      {state.removeDuplicates ? (
        <div>
          <h3 className="mb-2 font-medium text-gray-900 dark:text-gray-100">
            Duplicate key columns
          </h3>
          <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
            Leave empty to compare full rows.
          </p>
          <div className="flex flex-wrap gap-2">
            {headers.map((header, index) => (
              <label key={`${header}-${index}`} className="flex items-center gap-1 text-xs">
                <input
                  type="checkbox"
                  checked={state.duplicateKeyColumns.includes(index)}
                  onChange={(e) => {
                    const next = e.target.checked
                      ? [...state.duplicateKeyColumns, index].sort((a, b) => a - b)
                      : state.duplicateKeyColumns.filter((n) => n !== index);
                    update({ duplicateKeyColumns: next });
                  }}
                  data-testid={`sidebar-key-col-${index}`}
                />
                <span className="text-gray-700 dark:text-gray-300">
                  {header || `col ${index + 1}`}
                </span>
              </label>
            ))}
          </div>
        </div>
      ) : null}
      <div>
        <h3 className="mb-2 font-medium text-gray-900 dark:text-gray-100">Header naming</h3>
        <select
          value={state.headerNaming}
          onChange={(e) => update({ headerNaming: e.target.value as ToolState['headerNaming'] })}
          data-testid="sidebar-header-naming"
          className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs dark:border-gray-700 dark:bg-gray-800"
        >
          {HEADER_NAMINGS.map((naming) => (
            <option key={naming.value} value={naming.value}>
              {naming.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <h3 className="mb-2 font-medium text-gray-900 dark:text-gray-100">Columns kept</h3>
        <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
          None selected keeps every column in original order.
        </p>
        <div className="flex flex-wrap gap-2">
          {headers.map((header, index) => (
            <label key={`${header}-${index}`} className="flex items-center gap-1 text-xs">
              <input
                type="checkbox"
                checked={state.selectedColumns.includes(index)}
                onChange={(e) => {
                  const next = e.target.checked
                    ? [...state.selectedColumns, index].sort((a, b) => a - b)
                    : state.selectedColumns.filter((n) => n !== index);
                  update({ selectedColumns: next });
                }}
                data-testid={`sidebar-col-${index}`}
              />
              <span className="text-gray-700 dark:text-gray-300">
                {header || `col ${index + 1}`}
              </span>
            </label>
          ))}
        </div>
      </div>
      <div>
        <h3 className="mb-2 font-medium text-gray-900 dark:text-gray-100">Live stats</h3>
        {stats === null ? (
          <p className="text-xs text-gray-500 dark:text-gray-400" data-testid="sidebar-stats-empty">
            Paste CSV data to see stats.
          </p>
        ) : (
          <ul
            className="space-y-1 text-xs text-gray-700 dark:text-gray-300"
            data-testid="sidebar-stats"
          >
            <li>
              Rows: {stats.cleanedRows} of {stats.originalRows}
            </li>
            <li>Columns: {stats.columns}</li>
            <li>Duplicates removed: {stats.duplicatesRemoved}</li>
            <li>Empty rows removed: {stats.emptyRowsRemoved}</li>
            <li>Cells trimmed: {stats.cellsTrimmed}</li>
          </ul>
        )}
      </div>
      <div>
        <h3 className="mb-2 font-medium text-gray-900 dark:text-gray-100">Saved results</h3>
        <p className="text-xs text-gray-600 dark:text-gray-300" data-testid="sidebar-history-count">
          {state.history.length} entr{state.history.length === 1 ? 'y' : 'ies'} in history
          {state.history.length > 0 ? ' (newest first)' : ''}
        </p>
      </div>
      <div>
        <h3 className="mb-2 font-medium text-gray-900 dark:text-gray-100">Share</h3>
        <p className="text-xs text-gray-600 dark:text-gray-300">
          Use the toolbar share button to create a URL containing your cleaning settings and data;
          open it to restore the cleaned result.
        </p>
      </div>
      ;{' '}
    </div>
  );
};
