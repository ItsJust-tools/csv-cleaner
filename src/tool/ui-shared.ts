import { DEFAULT_STATE, type HeaderNaming, type ToolState } from './types';

export const HEADER_NAMINGS: { value: HeaderNaming; label: string; hint: string }[] = [
  { value: 'original', label: 'Original', hint: 'keep header names as-is' },
  { value: 'lowercase', label: 'lowercase', hint: 'lowercase all header names' },
  { value: 'snake_case', label: 'snake_case', hint: 'convert headers to snake_case' },
];

export function isState(value: unknown): value is ToolState {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Partial<ToolState>;
  return typeof v.csv === 'string' && typeof v.hasHeader === 'boolean';
}

export { DEFAULT_STATE };
