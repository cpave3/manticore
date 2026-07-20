import { useState, Fragment } from 'react';
import type { LogRecordResponse, EventLogResponse, ClientResponse } from '../../../src/types/api';

type Sort = { by: string; dir: 'asc' | 'desc' };

export default function EventLogTable({
  data,
  loading,
  onSort,
  onPageChange,
  clients,
  clientFilter,
  onClientFilterChange,
  statusFilter,
  onStatusFilterChange,
}: {
  data: EventLogResponse | null;
  loading: boolean;
  onSort: (sort: Sort) => void;
  onPageChange: (page: number) => void;
  clients: ClientResponse[];
  clientFilter: string;
  onClientFilterChange: (clientId: string) => void;
  statusFilter: string;
  onStatusFilterChange: (status: string) => void;
}) {
  const [sort, setSort] = useState<Sort>({ by: 'createdAt', dir: 'desc' });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const headers: { key: string; label: string; sortable?: boolean }[] = [
    { key: 'createdAt', label: 'Timestamp' },
    { key: 'clientName', label: 'Client' },
    { key: 'sessionId', label: 'Session' },
    { key: 'modelId', label: 'Model' },
    { key: 'upstreamName', label: 'Upstream' },
    { key: 'promptTokens', label: 'Prompt' },
    { key: 'completionTokens', label: 'Completion' },
    { key: 'totalTokens', label: 'Total' },
    { key: 'tokensPerSecond', label: 'Tokens/sec', sortable: false },
    { key: 'latencyMs', label: 'Latency' },
    { key: 'status', label: 'Status' },
  ];

  function toggleSort(key: string) {
    const next: Sort =
      sort.by === key ? { by: key, dir: sort.dir === 'asc' ? 'desc' : 'asc' } : { by: key, dir: 'asc' };
    setSort(next);
    onSort(next);
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const totalPages = data ? Math.ceil(data.total / data.pageSize) : 0;
  const page = data?.page ?? 1;
  const colCount = headers.length + 1; // +1 for expand toggle column

  return (
    <div className="card table-card">
      <h3>Event Log</h3>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <select
          value={clientFilter}
          onChange={(e) => onClientFilterChange(e.target.value)}
          style={{ minWidth: 160 }}
        >
          <option value="">All clients</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => onStatusFilterChange(e.target.value)}
          style={{ minWidth: 140 }}
        >
          <option value="">All statuses</option>
          <option value="success">Success</option>
          <option value="error">Error</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>
      <table>
        <thead>
          <tr>
            <th style={{ width: 24, cursor: 'default' }}></th>
            {headers.map((h) => (
              <th
                key={h.key}
                onClick={h.sortable === false ? undefined : () => toggleSort(h.key)}
                style={h.sortable === false ? { cursor: 'default' } : undefined}
              >
                {h.label}
                {h.sortable !== false && sort.by === h.key && (sort.dir === 'asc' ? ' ▲' : ' ▼')}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={colCount} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                Loading…
              </td>
            </tr>
          ) : data?.items.length === 0 ? (
            <tr>
              <td colSpan={colCount} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                No events
              </td>
            </tr>
          ) : (
            data?.items.map((row) => (
              <Fragment key={row.id}>
                <tr>
                  <td
                    onClick={() => toggleExpand(row.id)}
                    style={{ cursor: 'pointer', fontSize: 12, textAlign: 'center', userSelect: 'none' }}
                  >
                    {expanded.has(row.id) ? '▼' : '▶'}
                  </td>
                  <td>{new Date(row.createdAt).toLocaleString()}</td>
                  <td>{row.clientName}</td>
                  <td>{row.sessionId ?? '—'}</td>
                  <td>{row.modelId}</td>
                  <td>{row.upstreamName ?? '—'}</td>
                  <td style={{ fontFamily: 'var(--mono)' }}>{row.promptTokens ?? '—'}</td>
                  <td style={{ fontFamily: 'var(--mono)' }}>{row.completionTokens ?? '—'}</td>
                  <td style={{ fontFamily: 'var(--mono)' }}>{row.totalTokens ?? '—'}</td>
                  <td style={{ fontFamily: 'var(--mono)' }}>
                    {row.tokensPerSecond == null ? '—' : row.tokensPerSecond.toFixed(1)}
                  </td>
                  <td style={{ fontFamily: 'var(--mono)' }}>{row.latencyMs.toLocaleString()}ms</td>
                  <td>
                    <StatusBadge status={row.status} />
                  </td>
                </tr>
                {expanded.has(row.id) && (
                  <tr>
                    <td colSpan={colCount} style={{ padding: 0 }}>
                      <div style={{ padding: '8px 16px 8px 40px', background: 'rgba(0,0,0,0.15)' }}>
                        <DetailGrid row={row} />
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))
          )}
        </tbody>
      </table>
      <div className="pagination">
        <button disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          Previous
        </button>
        <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>
          Page {page} of {totalPages || 1}
        </span>
        <button disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
          Next
        </button>
      </div>
    </div>
  );
}

function DetailGrid({ row }: { row: LogRecordResponse }) {
  const items: { label: string; value: string }[] = [
    { label: 'Status Code', value: row.statusCode != null ? String(row.statusCode) : '—' },
    { label: 'Error Message', value: row.errorMessage ?? '—' },
    { label: 'Time to First Token', value: row.timeToFirstTokenMs != null ? `${row.timeToFirstTokenMs}ms` : '—' },
    { label: 'Finish Reason', value: row.finishReason ?? '—' },
    { label: 'Total Tokens', value: row.totalTokens != null ? row.totalTokens.toLocaleString() : '—' },
    { label: 'Record ID', value: row.id },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '4px 24px' }}>
      {items.map((item) => (
        <div key={item.label} style={{ display: 'flex', gap: 8, fontSize: 13 }}>
          <span style={{ color: 'var(--text-muted)', minWidth: 140 }}>{item.label}</span>
          <span style={{ fontFamily: 'var(--mono)', color: 'var(--text)', wordBreak: 'break-all' }}>
            {item.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: LogRecordResponse['status'] }) {
  const color =
    status === 'success'
      ? 'var(--success)'
      : status === 'error'
        ? 'var(--danger)'
        : 'var(--warning)';
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 12,
        fontSize: 12,
        fontWeight: 500,
        background: color + '22',
        color,
      }}
    >
      {status}
    </span>
  );
}
