import type { Tool, DeserializeResult } from '@itsjust/core';
import toolConfig from './tool.config';
import {
  DEFAULT_STATE,
  MAX_HISTORY,
  summaryText,
  type HistoryEntry,
  type ToolState,
} from './types';

const STRING_KEYS = ['csv', 'delimiter'] as const;

const BOOLEAN_KEYS = [
  'hasHeader',
  'trimWhitespace',
  'normalizeLineEndings',
  'removeEmptyRows',
  'removeDuplicates',
  'coerceEnabled',
  'includeHeader',
  'copyHeader',
] as const;

const NUMBER_LIST_KEYS = ['duplicateKeyColumns', 'selectedColumns', 'columnWidths'] as const;

function numberListOr(value: unknown, fallback: number[]): number[] {
  if (!Array.isArray(value)) return fallback;
  return value.filter((n): n is number => Number.isInteger(n) && n >= 0);
}

function validHistory(value: unknown): HistoryEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (entry): entry is HistoryEntry =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as HistoryEntry).text === 'string' &&
        typeof (entry as HistoryEntry).createdAt === 'string'
    )
    .slice(0, MAX_HISTORY);
}

/** Serialize tool state into a compact JSON string for share/import. */
export function serializeState(state: ToolState): string {
  return JSON.stringify(state);
}

/** Recover tool state from an arbitrary imported/shared payload. */
export function deserializeState(data: unknown): DeserializeResult<ToolState> {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return { success: false, error: 'Invalid data format: expected CSV Cleaner state object' };
  }
  const v = data as Record<string, unknown>;
  const state: ToolState = {
    ...DEFAULT_STATE,
    history: validHistory(v.history),
  };
  for (const key of STRING_KEYS) {
    if (typeof v[key] === 'string') state[key] = v[key] as string;
  }
  for (const key of BOOLEAN_KEYS) {
    if (typeof v[key] === 'boolean') state[key] = v[key] as boolean;
  }
  for (const key of NUMBER_LIST_KEYS) {
    state[key] = numberListOr(v[key], DEFAULT_STATE[key]);
  }
  const naming = v.headerNaming;
  if (naming === 'original' || naming === 'lowercase' || naming === 'snake_case') {
    state.headerNaming = naming;
  }
  const boolRender = v.booleanRender;
  if (boolRender === 'trueFalse' || boolRender === 'yesNo' || boolRender === 'oneZero') {
    state.booleanRender = boolRender;
  }
  const quoting = v.quoting;
  if (quoting === 'auto' || quoting === 'all' || quoting === 'minimal' || quoting === 'none') {
    state.quoting = quoting;
  }
  if (Array.isArray(v.headerRenames)) {
    state.headerRenames = v.headerRenames
      .filter(
        (entry): entry is { index: number; original: string; name: string } =>
          typeof entry === 'object' &&
          entry !== null &&
          Number.isInteger((entry as { index: unknown }).index) &&
          typeof (entry as { original: unknown }).original === 'string' &&
          typeof (entry as { name: unknown }).name === 'string'
      )
      .slice(0, 50);
  }
  if (typeof v.coerceColumn === 'string') state.coerceColumn = v.coerceColumn;
  return { success: true, data: state };
}

/** Append a history entry to state, capped at MAX_HISTORY, newest first. */
export function withHistory(state: ToolState, text: string, now = new Date()): ToolState {
  const entry: HistoryEntry = { text, createdAt: now.toISOString() };
  return { ...state, history: [entry, ...state.history].slice(0, MAX_HISTORY) };
}

/** True when a serialized string round-trips back to the same state. */
export function roundTrips(state: ToolState): boolean {
  try {
    const restored = deserializeState(JSON.parse(serializeState(state)));
    return restored.success && JSON.stringify(restored.data) === JSON.stringify(state);
  } catch {
    return false;
  }
}

export const csvCleanerTool: Tool<ToolState> = {
  id: toolConfig.id,
  name: toolConfig.name,
  version: toolConfig.version,
  config: toolConfig,
  initialState: { ...DEFAULT_STATE },
  serialize: serializeState,
  deserialize: deserializeState,
  exporters: [
    { format: 'png', loader: () => import('./exporters/png') },
    { format: 'jpeg', loader: () => import('./exporters/jpeg') },
    { format: 'webp', loader: () => import('./exporters/webp') },
    { format: 'pdf', loader: () => import('./exporters/pdf') },
  ],
};

export { summaryText, DEFAULT_STATE, MAX_HISTORY };
