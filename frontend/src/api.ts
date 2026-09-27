const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') || '';

function toApiUrl(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
}

export async function getJSON<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(toApiUrl(path), { signal });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.detail?.message ?? `The data service returned ${response.status}. Check that the backend is running.`);
  }
  return response.json() as Promise<T>;
}

export async function postJSON<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(toApiUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const detail = payload?.detail;
    throw new Error(Array.isArray(detail) ? detail.map((d: { msg: string }) => d.msg).join('; ') : detail?.message ?? `Request failed (${response.status}).`);
  }
  return response.json() as Promise<T>;
}

export async function fetchOceanAnalytics(plan: unknown, signal?: AbortSignal) {
  return postJSON<import('./types').OceanAnalyticsResult>('/api/query/ocean-analytics', plan, signal);
}

export async function exportGeoJSON(plan: unknown) {
  const response = await fetch(toApiUrl('/api/query/geojson'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(plan),
  });
  if (!response.ok) throw new Error('Failed to export GeoJSON');
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `floatchat-query-geojson.geojson`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

