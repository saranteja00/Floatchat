import type { Profile, Variable } from './types';

/** Replay is a sequence of observed instants, not a simulated continuous trajectory. */
export function observationTimes(profiles: Profile[]): string[] {
  return [...new Set(profiles.map(p => p.timestamp))].sort();
}

export function throughTime(profiles: Profile[], timestamp: string | null): Profile[] {
  return timestamp === null ? profiles : profiles.filter(p => p.timestamp <= timestamp);
}

export function replayFrame(profiles: Profile[], index: number) {
  const times = observationTimes(profiles);
  if (!times.length) return { timestamp: null, selected: '' };
  const timestamp = times[Math.max(0, Math.min(index, times.length - 1))];
  const selected = profiles.filter(p => p.timestamp === timestamp).sort((a, b) => a.id.localeCompare(b.id))[0]?.id ?? '';
  return { timestamp, selected };
}

export const COLOR_DOMAINS: Record<Variable, { min: number; max: number; units: string }> = {
  temperature: { min: 0, max: 32, units: '°C' },
  salinity: { min: 32, max: 37, units: 'PSS-78' },
};

/** Fixed color domains retain meaning across profiles/time; missing stays missing. */
export function colorFraction(value: number | null, variable: Variable): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  const domain = COLOR_DOMAINS[variable];
  return Math.max(0, Math.min(1, (value - domain.min) / (domain.max - domain.min)));
}

export function displayHeight(depth: number, exaggeration: number): number {
  if (!Number.isFinite(depth) || depth < 0 || ![1, 100, 300].includes(exaggeration)) throw new Error('Invalid display depth or exaggeration');
  return -depth * exaggeration;
}
