export const API_KEY_PREFIX = 'mc_';

export type ClientResponse = {
  id: string;
  name: string;
  apiKeyPrefix: string;
  apiKeyMasked: string;
  createdAt: string;
  deletedAt: string | null;
};

export type ClientCreateResponse = ClientResponse & {
  apiKey: string;
};

export type UpstreamResponse = {
  id: string;
  name: string;
  type: 'openai-compatible' | 'chatgpt-codex';
  baseUrl: string | null;
  apiKeyMasked: string | null;
  headers: Record<string, string> | null;
  createdAt: string;
};

export type LogRecordResponse = {
  id: string;
  clientId: string;
  clientName: string;
  modelId: string;
  upstreamId: string | null;
  upstreamName: string | null;
  sessionId: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  latencyMs: number;
  timeToFirstTokenMs: number | null;
  finishReason: string | null;
  status: 'success' | 'error' | 'cancelled';
  statusCode: number | null;
  errorMessage: string | null;
  createdAt: string;
  tokensPerSecond: number | null;
};

export type DashboardSummary = {
  totalRequests: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  tokensPerSecond: number | null;
};

export type DashboardBreakdownRow = {
  key: string;
  label: string;
  requests: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  tokensPerSecond: number | null;
};

export type DashboardTimeSeriesPoint = {
  bucketStart: string;
  requests: number;
  promptTokens: number;
  completionTokens: number;
};

export type EventLogResponse = {
  items: LogRecordResponse[];
  total: number;
  page: number;
  pageSize: number;
};

export type ModelMappingResponse = {
  id: string;
  abstractName: string;
  upstreamId: string;
  upstreamName: string;
  modelPath: string;
  priority: number;
  createdAt: string;
};

export type ApiError = {
  error: {
    message: string;
    type: string;
    code?: string;
  };
};
