import type {
  ClientResponse,
  ClientCreateResponse,
  UpstreamResponse,
  DashboardSummary,
  DashboardBreakdownRow,
  DashboardTimeSeriesPoint,
  EventLogResponse,
  ModelMappingResponse,
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

export function updateClient(id: string, body: { name: string }) {
  return fetchJson<ClientResponse>(`/clients/${id}`, {
    method: 'PATCH',
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

export function updateUpstream(id: string, body: { name: string }) {
  return fetchJson<UpstreamResponse>(`/upstreams/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function deleteUpstream(id: string) {
  return fetchJson<void>(`/upstreams/${id}`, { method: 'DELETE' });
}

export function listModelMappings() {
  return fetchJson<ModelMappingResponse[]>('/model-mappings');
}

export function createModelMapping(body: {
  abstractName: string;
  upstreamId: string;
  modelPath: string;
  priority?: number;
}) {
  return fetchJson<ModelMappingResponse>('/model-mappings', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function updateModelMapping(
  id: string,
  body: {
    abstractName?: string;
    upstreamId?: string;
    modelPath?: string;
    priority?: number;
  }
) {
  return fetchJson<ModelMappingResponse>(`/model-mappings/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function deleteModelMapping(id: string) {
  return fetchJson<void>(`/model-mappings/${id}`, { method: 'DELETE' });
}

export function dashboardSummary(params?: { startDate?: string; endDate?: string }) {
  const qs = new URLSearchParams();
  if (params?.startDate) qs.set('startDate', params.startDate);
  if (params?.endDate) qs.set('endDate', params.endDate);
  const query = qs.toString();
  return fetchJson<DashboardSummary>(`/dashboard/summary${query ? `?${query}` : ''}`);
}

export function dashboardBreakdown(
  by: 'client' | 'model' | 'upstream' | 'session',
  params?: { clientId?: string; startDate?: string; endDate?: string }
) {
  const qs = new URLSearchParams();
  if (params?.clientId) qs.set('clientId', params.clientId);
  if (params?.startDate) qs.set('startDate', params.startDate);
  if (params?.endDate) qs.set('endDate', params.endDate);
  const query = qs.toString();
  return fetchJson<DashboardBreakdownRow[]>(`/dashboard/breakdown/${by}${query ? `?${query}` : ''}`);
}

export function dashboardTimeSeries(params: { bucket: 'hour' | 'day'; startDate?: string; endDate?: string }) {
  const qs = new URLSearchParams();
  qs.set('bucket', params.bucket);
  if (params.startDate) qs.set('startDate', params.startDate);
  if (params.endDate) qs.set('endDate', params.endDate);
  return fetchJson<DashboardTimeSeriesPoint[]>(`/dashboard/time-series?${qs}`);
}

export function eventLog(params: {
  page: number;
  pageSize: number;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  startDate?: string;
  endDate?: string;
}) {
  const qs = new URLSearchParams();
  qs.set('page', String(params.page));
  qs.set('pageSize', String(params.pageSize));
  if (params.sortBy) qs.set('sortBy', params.sortBy);
  if (params.sortDir) qs.set('sortDir', params.sortDir);
  if (params.startDate) qs.set('startDate', params.startDate);
  if (params.endDate) qs.set('endDate', params.endDate);
  return fetchJson<EventLogResponse>(`/dashboard/events?${qs}`);
}
