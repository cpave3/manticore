import { useState } from 'react';
import type { LogRecordResponse, EventLogResponse } from '../../../src/types/api';

type Sort = { by: string; dir: 'asc' | 'desc' };

export default function EventLogTable({
  data,
  loading,
  onSort,
  onPageChange,
}: {
  data: EventLogResponse | null;
  loading: boolean;
  onSort: (sort: Sort) => void;
  onPageChange: (page: number) => void;
}) {
  const [sort, setSort] = useState<Sort>({ by: 'createdAt', dir: 'desc' });

  const headers: { key: string; label: string; sortable?: boolean }[] = [
    { key: 'createdAt', label: 'Timestamp' },
    { key: 'clientName', label: 'Client' },
    { key: 'sessionId', label: 'Session' },
    { key: 'modelId', label: 'Model' },
    { key: 'upstreamName', label: 'Upstream' },
    { key: 'promptTokens', label: 'Prompt' },
    { key: 'completionTokens', label: 'Completion' },
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

  const totalPages = data ? Math.ceil(data.total / data.pageSize) : 0;
  const page = data?.page ?? 1;

  return (
    <div className="card table-card">
      <h3>Event Log</h3>
      <div>
        <table>
          <thead>
            <tr>
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
                <td colSpan={headers.length} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                  Loading…
                </td>
              </tr>
            ) : data?.items.length === 0 ? (
              <tr>
                <td colSpan={headers.length} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                  No events
                </td>
              </tr>
            ) : (
              data?.items.map((row) => (
                <tr key={row.id}>
                  <td>{new Date(row.createdAt).toLocaleString()}</td>
                  <td>{row.clientName}</td>
                  <td>{row.sessionId ?? '—'}</td>
                  <td>{row.modelId}</td>
                  <td>{row.upstreamName ?? '—'}</td>
                  <td style={{ fontFamily: 'var(--mono)' }}>{row.promptTokens ?? '—'}</td>
                  <td style={{ fontFamily: 'var(--mono)' }}>{row.completionTokens ?? '—'}</td>
                  <td style={{ fontFamily: 'var(--mono)' }}>
                    {row.tokensPerSecond == null ? '—' : row.tokensPerSecond.toFixed(1)}
                  </td>
                  <td style={{ fontFamily: 'var(--mono)' }}>{row.latencyMs.toLocaleString()}ms</td>
                  <td>
                    <StatusBadge status={row.status} />
                  </td>
                </tr>
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
