import type {
  ClientResponse,
  ClientCreateResponse,
  UpstreamResponse,
  DashboardSummary,
  DashboardBreakdownRow,
  DashboardTimeSeriesPoint,
  EventLogResponse,
} from '../../../src/types/api';

const API_BASE = '/api';

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: { message: res.statusText } }));
    throw new Error(body.error?.message ?? `HTTP ${res.status}`);
  }
  // DELETE returns 204 with no body
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export function listClients() {
  return fetchJson<ClientResponse[]>('/clients');
}

export function createClient(body: { name: string }) {
  return fetchJson<ClientCreateResponse>('/clients', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function deleteClient(id: string) {
  return fetchJson<void>(`/clients/${id}`, { method: 'DELETE' });
}

export function listUpstreams() {
  return fetchJson<UpstreamResponse[]>('/upstreams');
}

export function createUpstream(body: {
  name: string;
  baseUrl: string;
  apiKey?: string;
  headers?: Record<string, string>;
}) {
  return fetchJson<UpstreamResponse>('/upstreams', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function deleteUpstream(id: string) {
  return fetchJson<void>(`/upstreams/${id}`, { method: 'DELETE' });
}

export function dashboardSummary() {
  return fetchJson<DashboardSummary>('/dashboard/summary');
}

export function dashboardBreakdown(by: 'client' | 'model' | 'upstream') {
  return fetchJson<DashboardBreakdownRow[]>(`/dashboard/breakdown/${by}`);
}

export function dashboardTimeSeries(params: { bucket: 'hour' | 'day' }) {
  const url = new URL('/api/dashboard/time-series', location.origin);
  url.searchParams.set('bucket', params.bucket);
  return fetchJson<DashboardTimeSeriesPoint[]>(url.pathname + url.search);
}

export function eventLog(params: {
  page: number;
  pageSize: number;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}) {
  const url = new URL('/api/dashboard/events', location.origin);
  url.searchParams.set('page', String(params.page));
  url.searchParams.set('pageSize', String(params.pageSize));
  if (params.sortBy) url.searchParams.set('sortBy', params.sortBy);
  if (params.sortDir) url.searchParams.set('sortDir', params.sortDir);
  return fetchJson<EventLogResponse>(url.pathname + url.search);
}
