import { integer, sqliteTable, text, index } from 'drizzle-orm/sqlite-core';

export const clients = sqliteTable('clients', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  apiKey: text('api_key').notNull().unique(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
});

export type ClientSelect = typeof clients.$inferSelect;
export type ClientInsert = typeof clients.$inferInsert;

export const upstreams = sqliteTable('upstreams', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  baseUrl: text('base_url').notNull(),
  apiKey: text('api_key'),
  headers: text('headers'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

export type UpstreamSelect = typeof upstreams.$inferSelect;
export type UpstreamInsert = typeof upstreams.$inferInsert;

export const modelMappings = sqliteTable('model_mappings', {
  id: text('id').primaryKey(),
  abstractName: text('abstract_name').notNull(),
  upstreamName: text('upstream_name').notNull(),
  modelPath: text('model_path').notNull(),
  priority: integer('priority').notNull().default(1),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
}, (table) => [
  index('model_mappings_abstract_name_idx').on(table.abstractName),
]);

export const logRecords = sqliteTable('log_records', {
  id: text('id').primaryKey(),
  clientId: text('client_id').notNull(),
  clientName: text('client_name').notNull(),
  modelId: text('model_id').notNull(),
  upstreamId: text('upstream_id'),
  upstreamName: text('upstream_name'),
  promptTokens: integer('prompt_tokens'),
  completionTokens: integer('completion_tokens'),
  totalTokens: integer('total_tokens'),
  latencyMs: integer('latency_ms').notNull(),
  timeToFirstTokenMs: integer('time_to_first_token_ms'),
  finishReason: text('finish_reason'),
  status: text('status', { enum: ['success', 'error', 'cancelled'] }).notNull(),
  statusCode: integer('status_code'),
  errorMessage: text('error_message'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
}, (table) => [
  index('log_records_client_id_idx').on(table.clientId),
  index('log_records_upstream_id_idx').on(table.upstreamId),
  index('log_records_created_at_idx').on(table.createdAt),
]);

export type LogRecordSelect = typeof logRecords.$inferSelect;
export type LogRecordInsert = typeof logRecords.$inferInsert;

export type ModelMappingSelect = typeof modelMappings.$inferSelect;
export type ModelMappingInsert = typeof modelMappings.$inferInsert;
